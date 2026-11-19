import type {
  AlbumSummary,
  ArtistSummary,
  CollectionDetail,
  DiscoverPayload,
  PlaylistSummary,
  SearchResponse,
  Track,
} from '../types/music';
import { decodeHtmlEntities } from './format';

const SAAVN_DIRECT_BASE = 'https://saavn.sumit.co/api';

let backendDetected: boolean | null = null;
let backendProbePromise: Promise<boolean> | null = null;

export async function isBackendAvailable(): Promise<boolean> {
  if (backendDetected !== null) return backendDetected;
  if (backendProbePromise) return backendProbePromise;

  backendProbePromise = (async () => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/api/health', { signal: controller.signal });
      clearTimeout(t);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        backendDetected = false;
        return false;
      }
      const data = (await res.json()) as { ok?: boolean };
      backendDetected = Boolean(data?.ok);
      return backendDetected;
    } catch {
      backendDetected = false;
      return false;
    }
  })();

  return backendProbePromise;
}

export function getCachedBackendStatus(): boolean {
  return backendDetected === true;
}

interface RawSaavnImage {
  quality?: string;
  url?: string;
}

interface RawSaavnDownload {
  quality?: string;
  url?: string;
}

interface RawSaavnArtist {
  id?: string;
  name?: string;
  role?: string;
  image?: RawSaavnImage[];
}

interface RawSaavnSong {
  id?: string;
  name?: string;
  year?: string | number | null;
  releaseDate?: string | null;
  duration?: number | string | null;
  language?: string;
  label?: string;
  album?: { id?: string; name?: string };
  artists?: {
    primary?: RawSaavnArtist[];
    all?: RawSaavnArtist[];
  };
  image?: RawSaavnImage[];
  downloadUrl?: RawSaavnDownload[];
}

interface RawSaavnAlbum {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  year?: string | number | null;
  language?: string;
  songCount?: number | null;
  image?: RawSaavnImage[];
  artists?: {
    primary?: RawSaavnArtist[];
    all?: RawSaavnArtist[];
  };
  songs?: RawSaavnSong[];
}

interface RawSaavnPlaylist {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  subtitle?: string;
  songCount?: number | null;
  language?: string;
  image?: RawSaavnImage[];
  songs?: RawSaavnSong[];
}

interface RawItunesVideo {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
}

function pickImages(images?: RawSaavnImage[]) {
  const list = images || [];
  const small = list.find((i) => i.quality === '50x50')?.url || list[0]?.url || '';
  const medium =
    list.find((i) => i.quality === '150x150')?.url ||
    list[list.length - 1]?.url ||
    small;
  const large =
    list.find((i) => i.quality === '500x500')?.url ||
    list[list.length - 1]?.url ||
    medium;
  return { small, medium, large };
}

function formatLaunchDate(
  isoOrDate: string | null | undefined,
  yearFallback: string
): string {
  if (isoOrDate) {
    const parsed = new Date(isoOrDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return yearFallback || 'Unknown';
}

function normalizeSong(raw: RawSaavnSong): Track | null {
  if (!raw.id || !raw.downloadUrl || raw.downloadUrl.length === 0) return null;
  const primaryArtists = raw.artists?.primary?.length
    ? raw.artists.primary
    : raw.artists?.all || [];
  const artistNames = primaryArtists
    .map((a) => decodeHtmlEntities(a.name || ''))
    .filter(Boolean);

  const streams = (raw.downloadUrl || [])
    .filter((d) => Boolean(d.url && d.quality))
    .map((d) => ({ quality: d.quality as string, url: d.url as string }));
  if (streams.length === 0) return null;

  const yearStr = raw.year ? String(raw.year) : '';
  return {
    id: raw.id,
    kind: 'audio',
    title: decodeHtmlEntities(raw.name || 'Untitled Track'),
    artist:
      artistNames.length > 0 ? artistNames.slice(0, 3).join(', ') : 'Unknown Artist',
    primaryArtistId: primaryArtists[0]?.id,
    primaryArtistName: artistNames[0] || undefined,
    album: decodeHtmlEntities(raw.album?.name || 'Single'),
    albumId: raw.album?.id,
    year: yearStr,
    releaseDate: formatLaunchDate(raw.releaseDate, yearStr),
    duration: Number(raw.duration) || 0,
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    label: raw.label ? decodeHtmlEntities(raw.label) : undefined,
    artwork: pickImages(raw.image),
    streams,
  };
}

function normalizeAlbum(raw: RawSaavnAlbum): AlbumSummary | null {
  if (!raw.id) return null;
  const primary = raw.artists?.primary?.length
    ? raw.artists.primary
    : raw.artists?.all || [];
  const artist =
    primary
      .map((a) => decodeHtmlEntities(a.name || ''))
      .filter(Boolean)
      .slice(0, 2)
      .join(', ') || 'Various Artists';

  return {
    id: raw.id,
    title: decodeHtmlEntities(raw.name || raw.title || 'Untitled Album'),
    artist,
    year: raw.year ? String(raw.year) : '',
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    songCount: raw.songCount ?? undefined,
    artwork: pickImages(raw.image),
  };
}

function normalizePlaylist(raw: RawSaavnPlaylist): PlaylistSummary | null {
  if (!raw.id) return null;
  return {
    id: raw.id,
    title: decodeHtmlEntities(raw.name || raw.title || 'Curated Playlist'),
    subtitle: decodeHtmlEntities(raw.description || raw.subtitle || 'Non-stop mix'),
    songCount: raw.songCount ?? undefined,
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    artwork: pickImages(raw.image),
  };
}

function normalizeArtist(raw: RawSaavnArtist): ArtistSummary | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: raw.id,
    name: decodeHtmlEntities(raw.name),
    role: raw.role || 'Singer',
    artwork: pickImages(raw.image),
  };
}

function normalizeItunesVideo(raw: RawItunesVideo): Track | null {
  if (!raw.trackId || !raw.previewUrl) return null;
  const art100 = raw.artworkUrl100 || '';
  const art300 = art100 ? art100.replace('100x100bb', '300x300bb') : '';
  const art600 = art100 ? art100.replace('100x100bb', '600x600bb') : '';
  const yearStr = raw.releaseDate ? raw.releaseDate.slice(0, 4) : '';
  return {
    id: `mv-${raw.trackId}`,
    kind: 'video',
    title: raw.trackName || 'Untitled Music Video',
    artist: raw.artistName || 'Unknown Artist',
    album: raw.collectionName || 'Music Video Single',
    year: yearStr,
    releaseDate: formatLaunchDate(raw.releaseDate, yearStr),
    duration: raw.trackTimeMillis ? Math.round(raw.trackTimeMillis / 1000) : 30,
    language: raw.primaryGenreName || 'Music Video',
    artwork: { small: art100, medium: art300, large: art600 },
    streams: [{ quality: 'HD Video', url: raw.previewUrl }],
  };
}

function dedupeTracks(tracks: Track[], excludeIds = new Set<string>()): Track[] {
  const seen = new Set<string>(excludeIds);
  const out: Track[] = [];
  for (const t of tracks) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

async function directSaavn<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${SAAVN_DIRECT_BASE}${endpoint}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json?.data || null;
  } catch {
    return null;
  }
}

const PHONETIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\baasaman\b/gi, 'aasman'],
  [/\baasmaan\b/gi, 'aasman'],
  [/\btode\b/gi, 'tod'],
  [/\bhoyi\b/gi, 'hoi'],
  [/\bjeee+\b/gi, 'ji'],
  [/\bjee\b/gi, 'ji'],
  [/\bbhojpri\b/gi, 'bhojpuri'],
  [/\bbhojpury\b/gi, 'bhojpuri'],
  [/\bkhesri\b/gi, 'khesari'],
  [/\bpwan\b/gi, 'pawan'],
  [/\bsinhg\b/gi, 'singh'],
  [/\bydav\b/gi, 'yadav'],
  [/\barijt\b/gi, 'arijit'],
  [/\bkesriya\b/gi, 'kesariya'],
  [/\bashqi\b/gi, 'aashiqui'],
  [/\bvodeo\b/gi, 'video'],
  [/\bserch\b/gi, 'search'],
];

function normalizePhoneticQuery(raw: string): string {
  let out = raw
    .trim()
    .replace(/([a-zA-Z])\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ');
  for (const [pattern, replacement] of PHONETIC_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

function fetchJsonpSuggest(query: string): Promise<string[]> {
  if (typeof document === 'undefined' || !query.trim()) {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const cbName = `__swaraSuggest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 2500);

    const cleanup = () => {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[cbName];
      script.remove();
    };

    (window as unknown as Record<string, unknown>)[cbName] = (data: unknown) => {
      cleanup();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const list = (data[1] as Array<string | [string]>)
          .map((item) => (Array.isArray(item) ? String(item[0] || '') : String(item || '')))
          .filter(Boolean);
        resolve(list.slice(0, 5));
      } else {
        resolve([]);
      }
    };

    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(
      query
    )}&callback=${cbName}`;
    script.onerror = () => {
      cleanup();
      resolve([]);
    };
    document.head.appendChild(script);
  });
}

async function directSongs(query: string, limit = 24): Promise<Track[]> {
  const data = await directSaavn<{ results?: RawSaavnSong[] }>(
    `/search/songs?query=${encodeURIComponent(query)}&page=1&limit=${limit}`
  );
  return (data?.results || [])
    .map(normalizeSong)
    .filter((t): t is Track => t !== null);
}

const DM_NOISE_RE = /\b(status|whatsapp|shorts?|reaction|interview|teaser|trailer|making of|behind the scenes|jukebox|mashup|non[\s-]?stop|all songs)\b/i;

async function directDailymotionVideos(query: string, limit = 12): Promise<Track[]> {
  try {
    const fetchLimit = Math.min(30, Math.max(14, limit * 2));
    const res = await fetch(
      `https://api.dailymotion.com/videos?search=${encodeURIComponent(
        query
      )}&fields=id,title,duration,owner.screenname,thumbnail_720_url,thumbnail_480_url,thumbnail_240_url,created_time&limit=${fetchLimit}`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      list?: Array<{
        id?: string;
        title?: string;
        duration?: number;
        'owner.screenname'?: string;
        thumbnail_720_url?: string;
        thumbnail_480_url?: string;
        thumbnail_240_url?: string;
        created_time?: number;
      }>;
    };
    const out: Track[] = [];
    for (const raw of json.list || []) {
      const duration = Number(raw.duration) || 0;
      if (!raw.id || !raw.title || duration < 60 || duration > 900) continue;
      if (DM_NOISE_RE.test(raw.title)) continue;
      const dateObj = raw.created_time ? new Date(raw.created_time * 1000) : null;
      const yearStr =
        dateObj && !Number.isNaN(dateObj.getTime()) ? String(dateObj.getFullYear()) : '';
      out.push({
        id: `dm-embed-${raw.id}`,
        kind: 'video',
        title: decodeHtmlEntities(raw.title),
        artist: decodeHtmlEntities(raw['owner.screenname'] || 'Music Video'),
        album: 'Full Video Song',
        year: yearStr,
        releaseDate: yearStr || 'Full Video',
        duration,
        language: 'Full Video',
        artwork: {
          small: raw.thumbnail_240_url || raw.thumbnail_480_url || '',
          medium: raw.thumbnail_480_url || raw.thumbnail_720_url || '',
          large: raw.thumbnail_720_url || raw.thumbnail_480_url || '',
        },
        streams: [{ quality: 'Full HD Video', url: `dm-embed://${raw.id}` }],
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function directAudiusSongs(query: string, limit = 6): Promise<Track[]> {
  try {
    const res = await fetch(
      `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(
        query
      )}&app_name=Swara`
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{
        id?: string;
        title?: string;
        duration?: number;
        genre?: string;
        release_date?: string;
        user?: { name?: string };
        artwork?: { '150x150'?: string; '480x480'?: string };
      }>;
    };
    const out: Track[] = [];
    for (const item of json.data || []) {
      if (!item.id || !item.title || !item.duration || item.duration < 45) continue;
      out.push({
        id: `audius-${item.id}`,
        kind: 'audio',
        title: decodeHtmlEntities(item.title),
        artist: decodeHtmlEntities(item.user?.name || 'Independent Artist'),
        album: item.genre || 'Audius Single',
        year: item.release_date ? item.release_date.slice(0, 4) : '',
        releaseDate: item.release_date ? item.release_date.slice(0, 4) : 'Unknown',
        duration: Math.round(item.duration),
        language: item.genre || 'Music',
        artwork: {
          small: item.artwork?.['150x150'] || '',
          medium: item.artwork?.['480x480'] || item.artwork?.['150x150'] || '',
          large: item.artwork?.['480x480'] || '',
        },
        streams: [
          {
            quality: '320kbps',
            url: `https://api.audius.co/v1/tracks/${encodeURIComponent(
              item.id
            )}/stream?app_name=Swara`,
          },
        ],
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

const STATIC_DISCOVER_SEEDS = [
  {
    id: 'golden-classics',
    title: 'Golden Classics (1950s–1980s)',
    subtitle: 'Timeless old-era gems with original film albums',
    eraLabel: '1950s – 1980s',
    query: 'kishore kumar lata mangeshkar hits',
    kind: 'audio' as const,
  },
  {
    id: 'retro-90s-2000s',
    title: 'Retro 90s & 2000s Melodies',
    subtitle: 'Kumar Sanu, Udit Narayan, Alka Yagnik & KK',
    eraLabel: '1990s – 2000s',
    query: '90s bollywood hits',
    kind: 'audio' as const,
  },
  {
    id: 'modern-2010s',
    title: '2010s Modern Essentials',
    subtitle: 'Arijit Singh, Pritam & soulful acoustic anthems',
    eraLabel: '2010s',
    query: 'arijit singh hits',
    kind: 'audio' as const,
  },
  {
    id: 'new-releases',
    title: 'Latest Releases (2024–2026)',
    subtitle: 'Fresh chart-toppers and recent film soundtracks',
    eraLabel: '2024 – 2026',
    query: 'new hindi songs 2025',
    kind: 'audio' as const,
  },
  {
    id: 'bhojpuri-hits',
    title: 'Bhojpuri Superhits',
    subtitle: 'Pawan Singh, Khesari Lal Yadav, Shilpi Raj & Nirahua',
    eraLabel: 'Bhojpuri · All Eras',
    query: 'pawan singh khesari lal bhojpuri hits',
    kind: 'audio' as const,
  },
  {
    id: 'hd-music-videos',
    title: 'Ad-Free Music Videos',
    subtitle: 'Watch official music videos in clean, uninterrupted playback',
    eraLabel: 'All Eras · Video',
    query: 'bollywood hits',
    kind: 'video' as const,
  },
];

export async function fetchDiscoverData(): Promise<DiscoverPayload> {
  if (await isBackendAvailable()) {
    const res = await fetch('/api/music/discover');
    if (res.ok) return (await res.json()) as DiscoverPayload;
  }

  const [shelves, playlistRes, albumRes, artistRes, bhojpuriArtistRes] = await Promise.all([
    Promise.all(
      STATIC_DISCOVER_SEEDS.map(async (seed) => ({
        ...seed,
        tracks:
          seed.kind === 'video'
            ? await directDailymotionVideos(`${seed.query} video song`, 8)
            : await directSongs(seed.query, 8),
      }))
    ),
    directSaavn<{ results?: RawSaavnPlaylist[] }>(
      '/search/playlists?query=top%20hindi&limit=8'
    ),
    directSaavn<{ results?: RawSaavnAlbum[] }>(
      '/search/albums?query=bollywood%20hits&limit=8'
    ),
    Promise.all(
      [
        'Arijit Singh',
        'Kishore Kumar',
        'Lata Mangeshkar',
        'Shreya Ghoshal',
        'KK',
        'AR Rahman',
        'Kumar Sanu',
        'Diljit Dosanjh',
      ].map((singer) =>
        directSaavn<{ results?: RawSaavnArtist[] }>(
          `/search/artists?query=${encodeURIComponent(singer)}&limit=1`
        )
      )
    ),
    Promise.all(
      [
        'Pawan Singh',
        'Khesari Lal Yadav',
        'Shilpi Raj',
        'Dinesh Lal Yadav',
        'Manoj Tiwari',
        'Neelkamal Singh',
        'Ritesh Pandey',
        'Akshara Singh',
      ].map((singer) =>
        directSaavn<{ results?: RawSaavnArtist[] }>(
          `/search/artists?query=${encodeURIComponent(singer)}&limit=1`
        )
      )
    ),
  ]);

  return {
    shelves: shelves.filter((s) => s.tracks.length > 0),
    playlists: (playlistRes?.results || [])
      .map(normalizePlaylist)
      .filter((p): p is PlaylistSummary => p !== null),
    albums: (albumRes?.results || [])
      .map(normalizeAlbum)
      .filter((a): a is AlbumSummary => a !== null),
    artists: artistRes
      .map((r) => (r?.results?.[0] ? normalizeArtist(r.results[0]) : null))
      .filter((a): a is ArtistSummary => a !== null),
    bhojpuriArtists: bhojpuriArtistRes
      .map((r) => (r?.results?.[0] ? normalizeArtist(r.results[0]) : null))
      .filter((a): a is ArtistSummary => a !== null),
  };
}

export async function fetchSearchData(
  query: string,
  limit = 24
): Promise<SearchResponse> {
  if (await isBackendAvailable()) {
    const res = await fetch(
      `/api/music/search?query=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (res.ok) return (await res.json()) as SearchResponse;
  }

  const phoneticQuery = normalizePhoneticQuery(query);
  const [rawTracks, suggestions, videos, audiusTracks, albumData, playlistData, artistData] =
    await Promise.all([
      directSongs(query, limit),
      fetchJsonpSuggest(query),
      directDailymotionVideos(`${phoneticQuery} video song`, 12),
      directAudiusSongs(phoneticQuery, 6),
      directSaavn<{ results?: RawSaavnAlbum[] }>(
        `/search/albums?query=${encodeURIComponent(phoneticQuery)}&limit=12`
      ),
      directSaavn<{ results?: RawSaavnPlaylist[] }>(
        `/search/playlists?query=${encodeURIComponent(phoneticQuery)}&limit=10`
      ),
      directSaavn<{ results?: RawSaavnArtist[] }>(
        `/search/artists?query=${encodeURIComponent(phoneticQuery)}&limit=8`
      ),
    ]);

  const corrected =
    suggestions[0] && suggestions[0].toLowerCase() !== query.toLowerCase()
      ? suggestions[0]
      : phoneticQuery !== query
        ? phoneticQuery
        : '';

  const extraTracks =
    corrected && corrected.toLowerCase() !== query.toLowerCase()
      ? await directSongs(corrected, limit)
      : [];

  const tracks = dedupeTracks([...rawTracks, ...extraTracks, ...audiusTracks]);
  const seenIds = new Set(tracks.map((t) => t.id));
  const seedTrack = tracks[0];
  const seedTerms: string[] = [];
  if (seedTrack) {
    const firstArtist = seedTrack.artist.split(',')[0].trim();
    if (firstArtist && firstArtist.toLowerCase() !== query.toLowerCase()) {
      seedTerms.push(firstArtist);
    }
    if (seedTrack.album && seedTrack.album !== 'Single' && seedTrack.album !== seedTrack.title) {
      seedTerms.push(seedTrack.album);
    }
  }
  const similarBatches = await Promise.all(
    seedTerms.slice(0, 2).map((term) => directSongs(term, 12))
  );

  return {
    query,
    correctedQuery: corrected || undefined,
    tracks,
    videos,
    similar: dedupeTracks(similarBatches.flat(), seenIds).slice(0, 16),
    albums: (albumData?.results || [])
      .map(normalizeAlbum)
      .filter((a): a is AlbumSummary => a !== null),
    playlists: (playlistData?.results || [])
      .map(normalizePlaylist)
      .filter((p): p is PlaylistSummary => p !== null),
    artists: (artistData?.results || [])
      .map(normalizeArtist)
      .filter((a): a is ArtistSummary => a !== null),
  };
}

export async function fetchCollectionData(
  type: 'album' | 'playlist' | 'artist',
  id: string,
  nameFallback = ''
): Promise<CollectionDetail> {
  if (await isBackendAvailable()) {
    const url =
      type === 'album'
        ? `/api/music/album?id=${encodeURIComponent(id)}`
        : type === 'playlist'
          ? `/api/music/playlist?id=${encodeURIComponent(id)}`
          : `/api/music/artist?id=${encodeURIComponent(id)}&name=${encodeURIComponent(
              nameFallback
            )}`;
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as CollectionDetail;
  }

  if (type === 'album') {
    const data = await directSaavn<RawSaavnAlbum>(`/albums?id=${encodeURIComponent(id)}`);
    if (!data) throw new Error('Album not found');
    const meta = normalizeAlbum(data);
    const tracks = (data.songs || [])
      .map(normalizeSong)
      .filter((t): t is Track => t !== null);
    return {
      type: 'album',
      id,
      title: meta?.title || 'Album',
      subtitle: meta?.artist || 'Various Artists',
      meta: [
        meta?.year ? `Launched ${meta.year}` : '',
        meta?.language || '',
        `${tracks.length} tracks`,
      ]
        .filter(Boolean)
        .join(' · '),
      artwork: meta?.artwork.large || meta?.artwork.medium || '',
      tracks,
    };
  }

  if (type === 'playlist') {
    const data = await directSaavn<RawSaavnPlaylist>(
      `/playlists?id=${encodeURIComponent(id)}`
    );
    if (!data) throw new Error('Playlist not found');
    const meta = normalizePlaylist(data);
    const tracks = (data.songs || [])
      .map(normalizeSong)
      .filter((t): t is Track => t !== null);
    return {
      type: 'playlist',
      id,
      title: meta?.title || 'Playlist',
      subtitle: meta?.subtitle || 'Curated Non-Stop Playlist',
      meta: [meta?.language || '', `${tracks.length} tracks`]
        .filter(Boolean)
        .join(' · '),
      artwork: meta?.artwork.large || meta?.artwork.medium || '',
      tracks,
    };
  }

  interface RawArtistDetail {
    id?: string;
    name?: string;
    followerCount?: number;
    dominantLanguage?: string;
    image?: RawSaavnImage[];
    topSongs?: RawSaavnSong[];
    topAlbums?: RawSaavnAlbum[];
  }
  const artistDetail = id
    ? await directSaavn<RawArtistDetail>(`/artists/${encodeURIComponent(id)}`)
    : null;
  const artistName = decodeHtmlEntities(artistDetail?.name || nameFallback || 'Artist');
  let tracks = (artistDetail?.topSongs || [])
    .map(normalizeSong)
    .filter((t): t is Track => t !== null);
  if (tracks.length < 8) {
    const more = await directSongs(artistName, 24);
    tracks = dedupeTracks([...tracks, ...more]);
  }
  const art = pickImages(artistDetail?.image);
  return {
    type: 'artist',
    id: artistDetail?.id || id || artistName,
    title: artistName,
    subtitle: 'Singer Discography · Top Tracks & Albums',
    meta: `${tracks.length} songs`,
    artwork: art.large || art.medium || tracks[0]?.artwork.large || '',
    tracks,
    albums: (artistDetail?.topAlbums || [])
      .map(normalizeAlbum)
      .filter((a): a is AlbumSummary => a !== null),
  };
}

export async function fetchVideosCatalogData(
  query: string,
  limit = 24
): Promise<Track[]> {
  if (await isBackendAvailable()) {
    const res = await fetch(
      `/api/music/videos?query=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (res.ok) {
      const data = (await res.json()) as { videos?: Track[] };
      return data.videos || [];
    }
  }
  const clean = normalizePhoneticQuery(query) || query;
  return directDailymotionVideos(`${clean} video song`, limit);
}

export async function fetchMatchVideoData(
  title: string,
  artist: string,
  album: string
): Promise<{ matched: boolean; video: Track | null; candidates: Track[] }> {
  if (await isBackendAvailable()) {
    const res = await fetch(
      `/api/music/match-video?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(
        artist
      )}&album=${encodeURIComponent(album)}`
    );
    if (res.ok) {
      return (await res.json()) as {
        matched: boolean;
        video: Track | null;
        candidates: Track[];
      };
    }
  }

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const reqNorm = norm(title);
  const artistFirst = norm(artist.split(',')[0] || '');
  const list = await directDailymotionVideos(`${reqNorm} ${artistFirst}`.trim(), 10);
  const matched = list.filter((v) => {
    const vNorm = norm(v.title);
    const artistOk = !artistFirst || norm(v.artist).includes(artistFirst) || vNorm.includes(artistFirst);
    return vNorm.includes(reqNorm) && artistOk;
  });
  return {
    matched: matched.length > 0,
    video: matched[0] || null,
    candidates: matched,
  };
}

export async function fetchMatchAudioData(
  title: string,
  artist: string
): Promise<Track | null> {
  if (await isBackendAvailable()) {
    const res = await fetch(
      `/api/music/match-audio?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(
        artist
      )}`
    );
    if (res.ok) {
      const data = (await res.json()) as { track?: Track | null };
      if (data.track) return data.track;
    }
  }
  const cleanTitle = normalizePhoneticQuery(
    title
      .replace(/#video|#bhojpuri|#song|full\s*video|official\s*video/gi, ' ')
      .replace(/#\S+/g, ' ')
      .replace(/\|.*$/, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const songs = await directSongs(`${cleanTitle} ${artist}`.trim(), 5);
  return songs[0] || null;
}

export async function fetchSuggestionsData(
  artist: string,
  excludeId: string
): Promise<Track[]> {
  if (await isBackendAvailable()) {
    const res = await fetch(
      `/api/music/suggestions?artist=${encodeURIComponent(
        artist
      )}&excludeId=${encodeURIComponent(excludeId)}`
    );
    if (res.ok) {
      const data = (await res.json()) as { tracks?: Track[] };
      return data.tracks || [];
    }
  }
  const firstArtist = artist.split(',')[0].trim();
  if (!firstArtist) return [];
  const tracks = await directSongs(firstArtist, 10);
  return tracks.filter((t) => t.id !== excludeId).slice(0, 8);
}
