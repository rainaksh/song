import { spawn } from 'child_process';
import express from 'express';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const portFlagIndex = process.argv.indexOf('--port');
const cliPort =
  portFlagIndex !== -1 ? Number(process.argv[portFlagIndex + 1]) : NaN;
const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? cliPort
    : Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

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

interface RawDailymotionVideo {
  id?: string;
  title?: string;
  duration?: number;
  'owner.screenname'?: string;
  thumbnail_720_url?: string;
  thumbnail_480_url?: string;
  thumbnail_240_url?: string;
  created_time?: number;
  language?: string;
}

interface NormalizedTrack {
  id: string;
  kind: 'audio' | 'video';
  title: string;
  artist: string;
  primaryArtistId?: string;
  primaryArtistName?: string;
  album: string;
  albumId?: string;
  year: string;
  releaseDate: string;
  duration: number;
  language: string;
  label?: string;
  artwork: {
    small: string;
    medium: string;
    large: string;
  };
  streams: Array<{ quality: string; url: string }>;
}

const SAAVN_BASES = ['https://saavn.sumit.co/api', 'https://saavn.dev/api'];

function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
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

function formatLaunchDate(isoOrDate: string | null | undefined, yearFallback: string): string {
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

function normalizeSong(raw: RawSaavnSong): NormalizedTrack | null {
  if (!raw.id || !raw.downloadUrl || raw.downloadUrl.length === 0) return null;

  const primaryArtists = raw.artists?.primary?.length
    ? raw.artists.primary
    : raw.artists?.all || [];
  const artistNames = primaryArtists
    .map((a) => decodeEntities(a.name || ''))
    .filter(Boolean);

  const streams = (raw.downloadUrl || [])
    .filter((d) => Boolean(d.url && d.quality))
    .map((d) => ({ quality: d.quality as string, url: d.url as string }));

  if (streams.length === 0) return null;

  const yearStr = raw.year ? String(raw.year) : '';
  const releaseDateStr = formatLaunchDate(raw.releaseDate, yearStr);

  return {
    id: raw.id,
    kind: 'audio',
    title: decodeEntities(raw.name || 'Untitled Track'),
    artist:
      artistNames.length > 0 ? artistNames.slice(0, 3).join(', ') : 'Unknown Artist',
    primaryArtistId: primaryArtists[0]?.id,
    primaryArtistName: artistNames[0] || undefined,
    album: decodeEntities(raw.album?.name || 'Single'),
    albumId: raw.album?.id,
    year: yearStr,
    releaseDate: releaseDateStr,
    duration: Number(raw.duration) || 0,
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    label: raw.label ? decodeEntities(raw.label) : undefined,
    artwork: pickImages(raw.image),
    streams,
  };
}

function normalizeAlbum(raw: RawSaavnAlbum) {
  if (!raw.id) return null;
  const primary = raw.artists?.primary?.length
    ? raw.artists.primary
    : raw.artists?.all || [];
  const artist =
    primary
      .map((a) => decodeEntities(a.name || ''))
      .filter(Boolean)
      .slice(0, 2)
      .join(', ') || 'Various Artists';

  return {
    id: raw.id,
    title: decodeEntities(raw.name || raw.title || 'Untitled Album'),
    artist,
    year: raw.year ? String(raw.year) : '',
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    songCount: raw.songCount ?? undefined,
    artwork: pickImages(raw.image),
  };
}

function normalizePlaylist(raw: RawSaavnPlaylist) {
  if (!raw.id) return null;
  return {
    id: raw.id,
    title: decodeEntities(raw.name || raw.title || 'Curated Playlist'),
    subtitle: decodeEntities(raw.description || raw.subtitle || 'Non-stop mix'),
    songCount: raw.songCount ?? undefined,
    language: raw.language
      ? raw.language.charAt(0).toUpperCase() + raw.language.slice(1)
      : '',
    artwork: pickImages(raw.image),
  };
}

function normalizeArtist(raw: RawSaavnArtist) {
  if (!raw.id || !raw.name) return null;
  return {
    id: raw.id,
    name: decodeEntities(raw.name),
    role: raw.role || 'Singer',
    artwork: pickImages(raw.image),
  };
}

function normalizeItunesVideo(raw: RawItunesVideo): NormalizedTrack | null {
  if (!raw.trackId || !raw.previewUrl) return null;

  const art100 = raw.artworkUrl100 || '';
  const art300 = art100 ? art100.replace('100x100bb', '300x300bb') : '';
  const art600 = art100 ? art100.replace('100x100bb', '600x600bb') : '';

  const yearStr = raw.releaseDate ? raw.releaseDate.slice(0, 4) : '';
  const releaseDateStr = formatLaunchDate(raw.releaseDate, yearStr);

  return {
    id: `mv-${raw.trackId}`,
    kind: 'video',
    title: raw.trackName || 'Untitled Music Video',
    artist: raw.artistName || 'Unknown Artist',
    album: raw.collectionName || 'Music Video Single',
    year: yearStr,
    releaseDate: releaseDateStr,
    duration: raw.trackTimeMillis ? Math.round(raw.trackTimeMillis / 1000) : 30,
    language: raw.primaryGenreName || 'Music Video',
    artwork: {
      small: art100,
      medium: art300,
      large: art600,
    },
    streams: [{ quality: 'HD Video', url: raw.previewUrl }],
  };
}

async function fetchSaavnJson<T>(endpointPath: string): Promise<T | null> {
  for (const base of SAAVN_BASES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(`${base}${endpointPath}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SwaraMusicPlayer/1.0',
        },
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = (await res.json()) as { success?: boolean; data?: T };
      if (json?.data) return json.data;
    } catch {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchSongsFromUpstream(
  query: string,
  page = 1,
  limit = 24
): Promise<NormalizedTrack[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const data = await fetchSaavnJson<{ results?: RawSaavnSong[] }>(
    `/search/songs?query=${encodeURIComponent(cleanQuery)}&page=${page}&limit=${limit}`
  );
  if (!data?.results) return [];
  return data.results
    .map(normalizeSong)
    .filter((item): item is NormalizedTrack => item !== null);
}

async function fetchVideosFromItunes(
  query: string,
  limit = 12
): Promise<NormalizedTrack[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const endpoints = [
    `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&country=IN&media=musicVideo&limit=${limit}`,
    `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=musicVideo&limit=${limit}`,
  ];

  const seen = new Set<string>();
  const collected: NormalizedTrack[] = [];

  for (const url of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: RawItunesVideo[] };
      for (const item of json.results || []) {
        const normalized = normalizeItunesVideo(item);
        if (normalized && !seen.has(normalized.id)) {
          seen.add(normalized.id);
          collected.push(normalized);
        }
      }
      if (collected.length >= limit) break;
    } catch {
      clearTimeout(timeout);
    }
  }

  return collected.slice(0, limit);
}

const DM_NOISE_RE = /\b(status|whatsapp|shorts?|reaction|interview|teaser|trailer|making of|behind the scenes|jukebox|mashup|non[\s-]?stop|all songs|news|debate|speech|podcast|viral video|press conference|mike)\b/i;

function normalizeDailymotionVideo(raw: RawDailymotionVideo): NormalizedTrack | null {
  if (!raw.id || !raw.title) return null;
  const duration = Number(raw.duration) || 0;
  // Keep real full-length single music videos (60s to 10m)
  if (duration < 60 || duration > 600) return null;
  if (DM_NOISE_RE.test(raw.title)) return null;

  const createdMs = raw.created_time ? raw.created_time * 1000 : 0;
  const dateObj = createdMs ? new Date(createdMs) : null;
  const yearStr =
    dateObj && !Number.isNaN(dateObj.getTime())
      ? String(dateObj.getFullYear())
      : '';
  const releaseDateStr =
    dateObj && !Number.isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : yearStr || 'Full Video';

  const thumbSmall = raw.thumbnail_240_url || raw.thumbnail_480_url || '';
  const thumbMed = raw.thumbnail_480_url || raw.thumbnail_720_url || thumbSmall;
  const thumbLarge = raw.thumbnail_720_url || thumbMed;

  return {
    id: `dm-${raw.id}`,
    kind: 'video',
    title: decodeEntities(raw.title),
    artist: decodeEntities(raw['owner.screenname'] || 'Music Video'),
    album: 'Full Video Song',
    year: yearStr,
    releaseDate: releaseDateStr,
    duration,
    language: 'Full Video',
    artwork: {
      small: thumbSmall,
      medium: thumbMed,
      large: thumbLarge,
    },
    streams: [
      {
        quality: 'Full HD Video',
        url: `/api/music/hls-manifest?id=${encodeURIComponent(raw.id)}`,
      },
    ],
  };
}

function parseDurationLabel(label: string): number {
  const parts = label
    .trim()
    .split(':')
    .map((p) => Number(p))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
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

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
  '\u091a': 'ch', '\u091b': 'chh', '\u091c': 'j', '\u091d': 'jh', '\u091e': 'ny',
  '\u091f': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
  '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
  '\u092a': 'p', '\u092b': 'ph', '\u092c': 'b', '\u092d': 'bh', '\u092e': 'm',
  '\u092f': 'y', '\u0930': 'r', '\u0932': 'l', '\u0935': 'w',
  '\u0936': 'sh', '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
  '\u0958': 'k', '\u0959': 'kh', '\u095a': 'g', '\u095b': 'z', '\u095c': 'd',
  '\u095d': 'dh', '\u095e': 'f', '\u095f': 'y',
};

const DEVANAGARI_VOWELS: Record<string, string> = {
  '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee', '\u0909': 'u', '\u090a': 'oo',
  '\u090f': 'e', '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au',
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  '\u093e': 'a', '\u093f': 'i', '\u0940': 'i', '\u0941': 'u', '\u0942': 'u',
  '\u0947': 'e', '\u0948': 'ai', '\u094b': 'o', '\u094c': 'au',
};

function devanagariToLatin(input: string): string {
  if (!/[\u0900-\u097F]/.test(input)) return input;
  let out = '';
  const chars = Array.from(input);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1] || '';
    if (DEVANAGARI_CONSONANTS[ch]) {
      out += DEVANAGARI_CONSONANTS[ch];
      if (next === '\u094d') {
        i += 1; // halant suppresses inherent vowel
      } else if (DEVANAGARI_MATRAS[next]) {
        out += DEVANAGARI_MATRAS[next];
        i += 1;
      } else if (DEVANAGARI_CONSONANTS[next] || next === '\u0902' || next === '\u0901') {
        out += 'a';
      }
      continue;
    }
    if (DEVANAGARI_VOWELS[ch]) {
      out += DEVANAGARI_VOWELS[ch];
      continue;
    }
    if (ch === '\u0902' || ch === '\u0901') {
      out += 'n';
      continue;
    }
    if (ch === '\u093c') continue; // nukta handled via precomposed or skipped
    out += ch;
  }
  return out;
}

function scoreTrackQueryMatch(track: NormalizedTrack, query: string): number {
  const norm = (s: string) =>
    normalizePhoneticQuery(
      devanagariToLatin(decodeEntities(s))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const qNorm = norm(query);
  if (!qNorm) return 0;
  const rawTokens = qNorm.split(' ').filter((w) => w.length >= 2);
  const FILLER_TOKENS = new Set(['ke', 'ka', 'ki', 'ko', 'me', 'se', 'pe', 'hai', 'ho']);
  const nonFiller = rawTokens.filter((w) => !FILLER_TOKENS.has(w));
  const qTokens = nonFiller.length > 0 ? nonFiller : rawTokens;
  if (qTokens.length === 0) return 0;

  const titleNorm = norm(track.title);
  const artistNorm = norm(track.artist);
  const albumNorm = norm(track.album);
  const titleTokens = titleNorm.split(' ').filter((w) => w.length >= 2);
  const artistTokens = artistNorm.split(' ').filter((w) => w.length >= 2);
  const hay = `${titleNorm} ${artistNorm} ${albumNorm}`;
  const hayTokens = hay.split(' ').filter((w) => w.length >= 2);

  let score = 0;
  if (titleNorm.includes(qNorm)) score += 120;
  else if (artistNorm.includes(qNorm)) score += 105;
  else if (hay.includes(qNorm)) score += 75;

  let matched = 0;
  for (const qt of qTokens) {
    const inTitle = titleTokens.includes(qt) || (qt.length >= 5 && titleNorm.includes(qt));
    if (inTitle) {
      matched += 1;
      score += 20;
      continue;
    }
    const inArtist = artistTokens.includes(qt) || (qt.length >= 5 && artistNorm.includes(qt));
    if (inArtist) {
      matched += 1;
      score += 18;
      continue;
    }
    const inHay = hayTokens.includes(qt) || (qt.length >= 5 && hay.includes(qt));
    if (inHay) {
      matched += 1;
      score += 14;
      continue;
    }
    const maxDist = qt.length >= 6 ? 2 : 1;
    if (
      hayTokens.some(
        (ht) =>
          Math.abs(ht.length - qt.length) <= maxDist &&
          editDistance(qt, ht) <= maxDist
      )
    ) {
      matched += 0.85;
      score += 11;
    }
  }

  const coverage = matched / qTokens.length;
  score += Math.round(coverage * 60);
  if (qTokens.length >= 2 && coverage < 0.4) {
    score -= 35;
  }

  const isSaavnAudio = track.kind === 'audio' && !track.id.startsWith('audius-');
  if (
    isSaavnAudio &&
    qTokens[0].length >= 5 &&
    (titleNorm === qTokens[0] || titleNorm.startsWith(`${qTokens[0]} `))
  ) {
    score += 42;
  }

  if (coverage >= 0.5) {
    if (isSaavnAudio) {
      score += 48;
    } else if (track.id.startsWith('audius-')) {
      score += 2;
    }
  }
  return score;
}

async function fetchYouTubeSuggest(query: string): Promise<string[]> {
  const clean = query.trim();
  if (!clean) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(
        clean
      )}`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data?.[1]) ? data[1].slice(0, 5) : [];
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

async function fetchVideosFromYouTube(
  query: string,
  limit = 16
): Promise<{ videos: NormalizedTrack[]; correctedQuery?: string }> {
  const clean = query.trim();
  if (!clean) return { videos: [] };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
        },
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return { videos: [] };
    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (!match) return { videos: [] };
    const data = JSON.parse(match[1]) as {
      contents?: {
        twoColumnSearchResultsRenderer?: {
          primaryContents?: {
            sectionListRenderer?: {
              contents?: Array<{
                itemSectionRenderer?: {
                  contents?: Array<{
                    showingResultsForRenderer?: {
                      correctedQuery?: { runs?: Array<{ text?: string }> };
                    };
                    didYouMeanRenderer?: {
                      correctedQuery?: { runs?: Array<{ text?: string }> };
                    };
                    videoRenderer?: {
                      videoId?: string;
                      title?: { runs?: Array<{ text?: string }> };
                      ownerText?: { runs?: Array<{ text?: string }> };
                      lengthText?: { simpleText?: string };
                      publishedTimeText?: { simpleText?: string };
                      thumbnail?: { thumbnails?: Array<{ url?: string }> };
                    };
                  }>;
                };
              }>;
            };
          };
        };
      };
    };

    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents || [];
    let correctedQuery: string | undefined;
    const videos: NormalizedTrack[] = [];
    const seen = new Set<string>();

    for (const sec of sections) {
      for (const item of sec?.itemSectionRenderer?.contents || []) {
        if (!correctedQuery && item.showingResultsForRenderer?.correctedQuery?.runs) {
          correctedQuery = item.showingResultsForRenderer.correctedQuery.runs
            .map((r) => r.text || '')
            .join('')
            .trim();
        }
        if (!correctedQuery && item.didYouMeanRenderer?.correctedQuery?.runs) {
          correctedQuery = item.didYouMeanRenderer.correctedQuery.runs
            .map((r) => r.text || '')
            .join('')
            .trim();
        }

        const v = item.videoRenderer;
        if (!v?.videoId || seen.has(v.videoId)) continue;
        const rawTitle = (v.title?.runs || []).map((r) => r.text || '').join('').trim();
        const durLabel = v.lengthText?.simpleText || '';
        const duration = durLabel ? parseDurationLabel(durLabel) : 0;
        // Strictly full-length videos (60s to 15m), never 30s clips or hour-long streams
        if (!rawTitle || duration < 60 || duration > 900) continue;
        if (DM_NOISE_RE.test(rawTitle)) continue;

        seen.add(v.videoId);
        const channel =
          (v.ownerText?.runs || []).map((r) => r.text || '').join('').trim() ||
          'Music Channel';
        const thumbs = v.thumbnail?.thumbnails || [];
        const thumbSmall = thumbs[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;
        const thumbLarge =
          thumbs[thumbs.length - 1]?.url ||
          `https://i.ytimg.com/vi/${v.videoId}/hq720.jpg`;

        videos.push({
          id: `yt-${v.videoId}`,
          kind: 'video',
          title: decodeEntities(rawTitle),
          artist: decodeEntities(channel),
          album: 'YouTube Music & Video',
          year: '',
          releaseDate: v.publishedTimeText?.simpleText || 'Full Video',
          duration,
          language: 'Full Video',
          artwork: {
            small: thumbSmall,
            medium: thumbLarge,
            large: thumbLarge,
          },
          streams: [{ quality: 'YouTube HD', url: `yt://${v.videoId}` }],
        });
        if (videos.length >= limit) break;
      }
      if (videos.length >= limit) break;
    }

    return { videos, correctedQuery };
  } catch {
    clearTimeout(timeout);
    return { videos: [] };
  }
}

async function fetchSongsFromAudius(
  query: string,
  limit = 8
): Promise<NormalizedTrack[]> {
  const clean = query.trim();
  if (!clean) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(
        clean
      )}&app_name=Swara`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: Array<{
        id?: string;
        title?: string;
        duration?: number;
        genre?: string;
        release_date?: string;
        user?: { name?: string };
        artwork?: { '150x150'?: string; '480x480'?: string; '1000x1000'?: string };
      }>;
    };
    const out: NormalizedTrack[] = [];
    for (const item of json.data || []) {
      if (!item.id || !item.title || !item.duration || item.duration < 45) continue;
      const yearStr = item.release_date ? item.release_date.slice(0, 4) : '';
      out.push({
        id: `audius-${item.id}`,
        kind: 'audio',
        title: decodeEntities(item.title),
        artist: decodeEntities(item.user?.name || 'Independent Artist'),
        album: item.genre || 'Audius Single',
        year: yearStr,
        releaseDate: formatLaunchDate(item.release_date, yearStr),
        duration: Math.round(item.duration),
        language: item.genre || 'Music',
        artwork: {
          small: item.artwork?.['150x150'] || '',
          medium: item.artwork?.['480x480'] || item.artwork?.['150x150'] || '',
          large: item.artwork?.['1000x1000'] || item.artwork?.['480x480'] || '',
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
    clearTimeout(timeout);
    return [];
  }
}

async function fetchFullVideosFromDailymotion(
  query: string,
  limit = 16
): Promise<NormalizedTrack[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const fetchLimit = Math.min(30, Math.max(12, limit * 2));
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
      cleanQuery
    )}&fields=id,title,duration,owner.screenname,thumbnail_720_url,thumbnail_480_url,thumbnail_240_url,created_time,language&limit=${fetchLimit}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const json = (await res.json()) as { list?: RawDailymotionVideo[] };
    const normalized = (json.list || [])
      .map(normalizeDailymotionVideo)
      .filter((t): t is NormalizedTrack => t !== null);
    return normalized.slice(0, limit);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

const dmHlsCache = new Map<string, { mediaUrl: string; expiresAt: number }>();

async function resolveDailymotionVariantUrl(dmId: string): Promise<string | null> {
  const cached = dmHlsCache.get(dmId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.mediaUrl;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const metaRes = await fetch(
      `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(dmId)}`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
      }
    );
    clearTimeout(timeout);
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as {
      qualities?: Record<string, Array<{ type?: string; url?: string }>>;
    };
    const masterUrl =
      meta.qualities?.auto?.find((q) => q.url)?.url ||
      Object.values(meta.qualities || {})
        .flat()
        .find((q) => q.url)?.url;
    if (!masterUrl) return null;

    const masterRes = await fetch(masterUrl, {
      headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
    });
    if (!masterRes.ok) return null;
    const masterText = await masterRes.text();

    // Pick highest bandwidth stream URL from master playlist
    const lines = masterText.split(/\r?\n/).map((l) => l.trim());
    let bestUrl: string | null = null;
    let bestBw = -1;
    let pendingBw = 0;

    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        pendingBw = bwMatch ? Number(bwMatch[1]) : 0;
      } else if (line && !line.startsWith('#')) {
        const absUrl = new URL(line, masterUrl).toString();
        if (pendingBw >= bestBw) {
          bestBw = pendingBw;
          bestUrl = absUrl;
        }
        pendingBw = 0;
      }
    }

    const finalMediaUrl = bestUrl || masterUrl;
    dmHlsCache.set(dmId, {
      mediaUrl: finalMediaUrl,
      expiresAt: Date.now() + 8 * 60 * 1000,
    });
    return finalMediaUrl;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function dedupeTracks(
  tracks: NormalizedTrack[],
  excludeIds = new Set<string>()
): NormalizedTrack[] {
  const seen = new Set<string>(excludeIds);
  const out: NormalizedTrack[] = [];
  for (const t of tracks) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

interface DiscoverCache {
  expiresAt: number;
  payload: {
    shelves: Array<{
      id: string;
      title: string;
      subtitle: string;
      eraLabel: string;
      query: string;
      kind: 'audio' | 'video';
      tracks: NormalizedTrack[];
    }>;
    playlists: Array<NonNullable<ReturnType<typeof normalizePlaylist>>>;
    albums: Array<NonNullable<ReturnType<typeof normalizeAlbum>>>;
    artists: Array<NonNullable<ReturnType<typeof normalizeArtist>>>;
    bhojpuriArtists: Array<NonNullable<ReturnType<typeof normalizeArtist>>>;
  };
}

let discoverCache: DiscoverCache | null = null;

const DISCOVER_SEEDS = [
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

async function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/music/search', async (req, res) => {
    const query = String(req.query.query || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 24));

    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    try {
      const phoneticQuery = normalizePhoneticQuery(query);
      const [
        rawAudioTracks,
        ytResult,
        ytSuggests,
        dmVideoTracks,
        audiusTracks,
        albumData,
        playlistData,
        artistData,
      ] = await Promise.all([
        fetchSongsFromUpstream(query, page, limit).catch(() => [] as NormalizedTrack[]),
        fetchVideosFromYouTube(query, 14).catch(() => ({
          videos: [] as NormalizedTrack[],
          correctedQuery: undefined,
        })),
        fetchYouTubeSuggest(query).catch(() => [] as string[]),
        fetchFullVideosFromDailymotion(`${phoneticQuery} video song`, 10).catch(
          () => [] as NormalizedTrack[]
        ),
        fetchSongsFromAudius(phoneticQuery, 6).catch(() => [] as NormalizedTrack[]),
        fetchSaavnJson<{ results?: RawSaavnAlbum[] }>(
          `/search/albums?query=${encodeURIComponent(phoneticQuery)}&limit=12`
        ).catch(() => null),
        fetchSaavnJson<{ results?: RawSaavnPlaylist[] }>(
          `/search/playlists?query=${encodeURIComponent(phoneticQuery)}&limit=10`
        ).catch(() => null),
        fetchSaavnJson<{ results?: RawSaavnArtist[] }>(
          `/search/artists?query=${encodeURIComponent(phoneticQuery)}&limit=8`
        ).catch(() => null),
      ]);

      // Typo-tolerant fallback: run Saavn using spell-corrected / phonetic suggestion too
      const correctedCandidate =
        ytResult.correctedQuery ||
        (ytSuggests[0] &&
        ytSuggests[0].toLowerCase() !== query.toLowerCase()
          ? ytSuggests[0]
          : phoneticQuery !== query
            ? phoneticQuery
            : '');

      let extraAudio: NormalizedTrack[] = [];
      let extraAlbums: RawSaavnAlbum[] = [];
      let extraArtists: RawSaavnArtist[] = [];
      if (
        correctedCandidate &&
        correctedCandidate.toLowerCase() !== query.toLowerCase()
      ) {
        const [corrSongs, corrAlb, corrArt] = await Promise.all([
          fetchSongsFromUpstream(correctedCandidate, 1, limit).catch(
            () => [] as NormalizedTrack[]
          ),
          fetchSaavnJson<{ results?: RawSaavnAlbum[] }>(
            `/search/albums?query=${encodeURIComponent(correctedCandidate)}&limit=8`
          ).catch(() => null),
          fetchSaavnJson<{ results?: RawSaavnArtist[] }>(
            `/search/artists?query=${encodeURIComponent(correctedCandidate)}&limit=6`
          ).catch(() => null),
        ]);
        extraAudio = corrSongs;
        extraAlbums = corrAlb?.results || [];
        extraArtists = corrArt?.results || [];
      }

      const combinedSaavn = dedupeTracks([...rawAudioTracks, ...extraAudio, ...audiusTracks]);
      const effectiveQuery = correctedCandidate || phoneticQuery || query;
      const scoredAudioEntries = combinedSaavn
        .map((t) => ({ track: t, score: scoreTrackQueryMatch(t, effectiveQuery) }))
        .sort((a, b) => b.score - a.score);
      const scoredAudio = scoredAudioEntries.map((x) => x.track);

      // Include YouTube tracks in Songs list — prioritize them when Saavn lacks an exact match
      // (e.g., YT-only songs like "Dilwa Tode Ke - Chand Jee")
      const topScore = scoredAudioEntries[0]?.score ?? 0;
      const ytScoredEntries = ytResult.videos.map((v, idx) => {
        const base = scoreTrackQueryMatch(v, effectiveQuery);
        const rankBoost = base >= 50 && idx < 3 ? (3 - idx) * 14 : 0;
        return { track: v, score: base + rankBoost };
      });

      const matchingYtEntries = ytScoredEntries
        .filter((x) => x.score >= 75)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

      // Always allow strongly matching YT songs to compete by relevance score if Saavn doesn't have an exact title match
      let finalTracks: NormalizedTrack[];
      if (scoredAudio.length < 4 || topScore < 200) {
        const merged = [...scoredAudioEntries, ...matchingYtEntries].sort(
          (a, b) => b.score - a.score
        );
        finalTracks = dedupeTracks(merged.map((x) => x.track));
      } else {
        const highYt = matchingYtEntries
          .filter((x) => x.score >= 140)
          .slice(0, 4)
          .map((x) => x.track);
        finalTracks = dedupeTracks([...scoredAudio, ...highYt]);
      }

      // Strictly full-length music videos only (YouTube + Dailymotion, zero 30-second clips) ranked by relevance
      const musicCue = /\b(song|video|official|music|4k|hd|lyric|bhojpuri|gaana|geet|t-series|saregama|zee music)\b/i;
      const videoTracks = dedupeTracks([...ytResult.videos, ...dmVideoTracks])
        .map((v, idx) => {
          const base = scoreTrackQueryMatch(v, effectiveQuery);
          const cueBonus = musicCue.test(v.title) || musicCue.test(v.artist) ? 16 : 0;
          const ytOrderBonus = v.id.startsWith('yt-') && idx < 4 ? (4 - idx) * 6 : 0;
          return { v, s: base + cueBonus + ytOrderBonus };
        })
        .sort((a, b) => b.s - a.s)
        .map((x) => x.v);

      const albums = [...(albumData?.results || []), ...extraAlbums]
        .map(normalizeAlbum)
        .filter(
          (a, idx, arr): a is NonNullable<typeof a> =>
            a !== null && arr.findIndex((x) => x?.id === a.id) === idx
        );

      const playlists = (playlistData?.results || [])
        .map(normalizePlaylist)
        .filter((p): p is NonNullable<typeof p> => p !== null);

      const artists = [...(artistData?.results || []), ...extraArtists]
        .map(normalizeArtist)
        .filter(
          (a, idx, arr): a is NonNullable<typeof a> =>
            a !== null && arr.findIndex((x) => x?.id === a.id) === idx
        );

      // Build "Milte Julte" (similar/related) songs
      const seenIds = new Set(finalTracks.map((t) => t.id));
      let similar: NormalizedTrack[] = [];

      const seedTrack = scoredAudio[0] || finalTracks[0];
      const seedTerms: string[] = [];

      if (seedTrack) {
        const firstArtist = seedTrack.artist.split(',')[0].trim();
        if (firstArtist && firstArtist.toLowerCase() !== query.toLowerCase()) {
          seedTerms.push(firstArtist);
        }
        if (
          seedTrack.album &&
          seedTrack.album !== 'Single' &&
          seedTrack.album !== 'YouTube Music & Video' &&
          seedTrack.album !== seedTrack.title
        ) {
          seedTerms.push(seedTrack.album);
        }
      }

      const words = effectiveQuery.split(/\s+/).filter((w) => w.length >= 3);
      if (words.length > 1) {
        seedTerms.push(words[0]);
      } else if (finalTracks.length < 6 && words.length === 1) {
        seedTerms.push(`${words[0]} song`);
      }

      if (seedTerms.length > 0) {
        const similarBatches = await Promise.all(
          seedTerms
            .slice(0, 2)
            .map((term) =>
              fetchSongsFromUpstream(term, 1, 12).catch(() => [] as NormalizedTrack[])
            )
        );
        similar = dedupeTracks(similarBatches.flat(), seenIds).slice(0, 16);
      }

      res.json({
        query,
        correctedQuery:
          correctedCandidate &&
          correctedCandidate.toLowerCase() !== query.toLowerCase()
            ? correctedCandidate
            : undefined,
        page,
        tracks: finalTracks,
        videos: videoTracks,
        similar,
        albums,
        playlists,
        artists,
      });
    } catch (error) {
      console.error('Search error:', error);
      res.status(502).json({
        error: 'Could not reach the music catalog right now. Please try again.',
      });
    }
  });

  app.get('/api/music/album', async (req, res) => {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Album id is required.' });

    const data = await fetchSaavnJson<RawSaavnAlbum>(`/albums?id=${encodeURIComponent(id)}`);
    if (!data) {
      return res.status(404).json({ error: 'Album not found.' });
    }

    const albumMeta = normalizeAlbum(data);
    const tracks = (data.songs || [])
      .map(normalizeSong)
      .filter((t): t is NormalizedTrack => t !== null);

    res.json({
      type: 'album',
      id,
      title: albumMeta?.title || 'Album',
      subtitle: albumMeta?.artist || '',
      meta: [
        albumMeta?.year ? `Launched ${albumMeta.year}` : '',
        albumMeta?.language || '',
        `${tracks.length} tracks`,
      ]
        .filter(Boolean)
        .join(' · '),
      artwork: albumMeta?.artwork.large || albumMeta?.artwork.medium || '',
      tracks,
    });
  });

  app.get('/api/music/playlist', async (req, res) => {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Playlist id is required.' });

    const data = await fetchSaavnJson<RawSaavnPlaylist>(
      `/playlists?id=${encodeURIComponent(id)}&limit=40`
    );
    if (!data) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    const plMeta = normalizePlaylist(data);
    const tracks = (data.songs || [])
      .map(normalizeSong)
      .filter((t): t is NormalizedTrack => t !== null);

    res.json({
      type: 'playlist',
      id,
      title: plMeta?.title || 'Playlist',
      subtitle: plMeta?.subtitle || 'Curated Non-Stop Playlist',
      meta: [plMeta?.language || '', `${tracks.length} tracks`]
        .filter(Boolean)
        .join(' · '),
      artwork: plMeta?.artwork.large || plMeta?.artwork.medium || '',
      tracks,
    });
  });

  app.get('/api/music/artist', async (req, res) => {
    const id = String(req.query.id || '').trim();
    const name = String(req.query.name || '').trim();

    if (!id && !name) {
      return res.status(400).json({ error: 'Artist id or name is required.' });
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

    let artistDetail: RawArtistDetail | null = null;
    if (id) {
      artistDetail = await fetchSaavnJson<RawArtistDetail>(
        `/artists/${encodeURIComponent(id)}`
      );
    }

    const artistName = decodeEntities(artistDetail?.name || name || 'Artist');
    let tracks = (artistDetail?.topSongs || [])
      .map(normalizeSong)
      .filter((t): t is NormalizedTrack => t !== null);

    if (tracks.length < 8) {
      const more = await fetchSongsFromUpstream(artistName, 1, 24).catch(
        () => [] as NormalizedTrack[]
      );
      tracks = dedupeTracks([...tracks, ...more]);
    }

    const albums = (artistDetail?.topAlbums || [])
      .map(normalizeAlbum)
      .filter((a): a is NonNullable<typeof a> => a !== null);

    const art = pickImages(artistDetail?.image);
    const fans = artistDetail?.followerCount
      ? `${(artistDetail.followerCount / 1_000_000).toFixed(1)}M listeners`
      : '';

    res.json({
      type: 'artist',
      id: artistDetail?.id || id || artistName,
      title: artistName,
      subtitle: 'Singer Discography · Top Tracks & Albums',
      meta: [
        artistDetail?.dominantLanguage
          ? artistDetail.dominantLanguage.charAt(0).toUpperCase() +
            artistDetail.dominantLanguage.slice(1)
          : '',
        fans,
        `${tracks.length} songs`,
      ]
        .filter(Boolean)
        .join(' · '),
      artwork: art.large || art.medium || tracks[0]?.artwork.large || '',
      tracks,
      albums,
    });
  });

  app.get('/api/music/videos', async (req, res) => {
    const rawQuery = String(req.query.query || 'bollywood full video song').trim();
    const query = normalizePhoneticQuery(rawQuery) || rawQuery;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
    try {
      const [ytRes, dmVideos] = await Promise.all([
        fetchVideosFromYouTube(`${query} official video song`, limit).catch(() => ({
          videos: [] as NormalizedTrack[],
        })),
        fetchFullVideosFromDailymotion(`${query} video song`, Math.ceil(limit / 2)).catch(
          () => [] as NormalizedTrack[]
        ),
      ]);
      // Interleave YouTube & Dailymotion full-length videos (never 30s previews)
      const videos = dedupeTracks([...ytRes.videos, ...dmVideos]).slice(0, limit);
      res.json({ query: rawQuery, videos });
    } catch {
      res.status(502).json({ error: 'Could not load music videos.' });
    }
  });

  app.get('/api/music/hls-manifest', async (req, res) => {
    const dmId = String(req.query.id || '').trim();
    if (!dmId || !/^[a-zA-Z0-9_-]+$/.test(dmId)) {
      return res.status(400).send('Invalid video id.');
    }

    try {
      const mediaUrl = await resolveDailymotionVariantUrl(dmId);
      if (!mediaUrl) {
        return res.status(404).send('Video stream not available.');
      }

      const m3u8Res = await fetch(mediaUrl, {
        headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
      });
      if (!m3u8Res.ok) {
        return res.status(502).send('Could not fetch HLS manifest.');
      }
      const m3u8Text = await m3u8Res.text();

      const rewritten = m3u8Text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;
          if (trimmed.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
              const abs = new URL(uri, mediaUrl).toString();
              return `URI="/api/music/hls-seg?url=${encodeURIComponent(abs)}"`;
            });
          }
          const abs = new URL(trimmed, mediaUrl).toString();
          return `/api/music/hls-seg?url=${encodeURIComponent(abs)}`;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(rewritten);
    } catch {
      res.status(502).send('HLS manifest error.');
    }
  });

  app.get('/api/music/hls-seg', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) return res.status(400).end();

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).end();
    }

    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      (!host.endsWith('.dmcdn.net') && !host.endsWith('.dailymotion.com'))
    ) {
      return res.status(403).end();
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(502).end();
      }
      res.setHeader(
        'Content-Type',
        upstream.headers.get('content-type') || 'video/mp2t'
      );
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('stream/web').ReadableStream
      );
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(502).end();
    }
  });

  app.get('/api/music/download-dm', async (req, res) => {
    const dmId = String(req.query.id || '').trim();
    const rawName = String(req.query.filename || 'swara-video').trim();

    if (!dmId || !/^[a-zA-Z0-9_-]+$/.test(dmId)) {
      return res.status(400).json({ error: 'Invalid video id.' });
    }

    try {
      const mediaUrl = await resolveDailymotionVariantUrl(dmId);
      if (!mediaUrl) {
        return res.status(404).json({ error: 'Video stream unavailable.' });
      }

      const cleanedUnicode = rawName
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);

      const asciiBase =
        cleanedUnicode
          .replace(/[^a-zA-Z0-9\s._-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/^_+|_+$/g, '') || 'swara-video';

      const finalAscii = asciiBase.toLowerCase().endsWith('.mp4')
        ? asciiBase
        : `${asciiBase}.mp4`;
      const finalUtf8 = (cleanedUnicode || asciiBase).toLowerCase().endsWith('.mp4')
        ? cleanedUnicode || asciiBase
        : `${cleanedUnicode || asciiBase}.mp4`;

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${finalAscii}"; filename*=UTF-8''${encodeURIComponent(
          finalUtf8
        )}`
      );

      const ff = spawn('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        mediaUrl,
        '-c',
        'copy',
        '-bsf:a',
        'aac_adtstoasc',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1',
      ]);

      ff.stdout.pipe(res);
      ff.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      res.on('close', () => {
        if (!ff.killed) ff.kill('SIGKILL');
      });
    } catch {
      if (!res.headersSent) res.status(502).json({ error: 'Download failed.' });
    }
  });

  app.get('/api/music/match-video', async (req, res) => {
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const rawAlbum = String(req.query.album || '').trim();

    if (!rawTitle) {
      return res.status(400).json({ error: 'Track title is required.' });
    }

    const STOP_WORDS = new Set([
      'song',
      'songs',
      'video',
      'videos',
      'official',
      'music',
      'audio',
      'full',
      'hd',
      '4k',
      '1080p',
      '720p',
      'lyric',
      'lyrics',
      'lyrical',
      'from',
      'the',
      'a',
      'an',
      'ft',
      'feat',
      'featuring',
      'remix',
      'version',
      'lofi',
      'unplugged',
      'reprise',
      'acoustic',
      'title',
      'track',
      'hindi',
      'bollywood',
      'movie',
      'film',
      'ranbir',
      'kapoor',
      'alia',
      'bhatt',
    ]);

    const normalizeText = (input: string): string =>
      decodeEntities(input)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .replace(/\s+-\s+from\s+.*$/i, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const extractLeadSegment = (input: string): string => {
      const decoded = decodeEntities(input).replace(/\(.*?\)|\[.*?\]/g, ' ');
      const firstPart = decoded.split(/\s*[-|–—/]\s*/)[0] || decoded;
      return normalizeText(firstPart);
    };

    const extractTokens = (input: string): string[] => {
      const norm = normalizeText(input);
      if (!norm) return [];
      const filtered = norm
        .split(' ')
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
      return filtered.length > 0 ? filtered : norm.split(' ').filter(Boolean);
    };

    const reqTitleNorm = normalizeText(rawTitle);
    const reqTitleTokens = extractTokens(rawTitle);
    const primaryArtist = rawArtist.split(/,|&|\//)[0]?.trim() || '';
    const reqArtistTokens = extractTokens(primaryArtist || rawArtist);
    const reqAlbumNorm = normalizeText(rawAlbum);
    const reqAlbumTokens = extractTokens(rawAlbum);

    if (!reqTitleNorm || reqTitleTokens.length === 0) {
      return res.json({ matched: false, video: null, candidates: [] });
    }

    const scoreCandidates = (candidates: NormalizedTrack[]) => {
      return candidates
        .map((cand) => {
          const candRawNorm = normalizeText(cand.title);
          const candLeadNorm = extractLeadSegment(cand.title);
          const candLeadTokens = extractTokens(candLeadNorm);
          const candTitleTokens = extractTokens(cand.title);
          const candArtistNorm = normalizeText(cand.artist);
          const candAlbumNorm = normalizeText(cand.album);
          const combinedCandNorm = `${candRawNorm} ${candArtistNorm} ${candAlbumNorm}`;

          if (!candRawNorm || candTitleTokens.length === 0) {
            return { cand, score: -1 };
          }

          // Use the primary title segment (before "-" / "|") when available for Dailymotion/YouTube-style titles
          const extraAllowed = new Set([...reqArtistTokens, ...reqAlbumTokens]);
          const leadFiltered = candLeadTokens.filter(
            (t) => !extraAllowed.has(t) || reqTitleTokens.includes(t)
          );
          const fullFiltered = candTitleTokens.filter(
            (t) => !extraAllowed.has(t) || reqTitleTokens.includes(t)
          );
          const effectiveCandTokens =
            leadFiltered.length > 0
              ? leadFiltered
              : fullFiltered.length > 0
                ? fullFiltered
                : candTitleTokens;

          const exactTitle =
            candRawNorm === reqTitleNorm || candLeadNorm === reqTitleNorm;
          const phraseMatch =
            !exactTitle &&
            reqTitleNorm.length >= 5 &&
            (candLeadNorm.includes(reqTitleNorm) ||
              candRawNorm.includes(reqTitleNorm) ||
              reqTitleNorm.includes(candLeadNorm));

          let matchedReqTokens = 0;
          for (const rt of reqTitleTokens) {
            const hit = effectiveCandTokens.some(
              (ct) =>
                ct === rt ||
                (rt.length >= 5 && ct.length >= 5 && (ct.startsWith(rt) || rt.startsWith(ct)))
            );
            if (hit) matchedReqTokens += 1;
          }

          const reqRatio = matchedReqTokens / reqTitleTokens.length;
          const candRatio = matchedReqTokens / effectiveCandTokens.length;

          // Check artist alignment in either artist field or full video title
          let artistMatch = false;
          if (reqArtistTokens.length > 0) {
            artistMatch = reqArtistTokens.some(
              (at) => at.length >= 2 && combinedCandNorm.includes(at)
            );
          }

          const albumMatch =
            reqAlbumNorm.length >= 4 && combinedCandNorm.includes(reqAlbumNorm);

          // Strict gate so unrelated songs like "Tum Hi Ho Bandhu" or "Haan Tum Ho" are rejected
          let passesGate = false;
          if (exactTitle) {
            passesGate =
              reqTitleTokens.length >= 2 ||
              reqArtistTokens.length === 0 ||
              artistMatch ||
              albumMatch;
          } else {
            const allReqMatched =
              reqTitleTokens.length <= 3
                ? matchedReqTokens === reqTitleTokens.length
                : reqRatio >= 0.85;
            // Ensure no unrequested extra song-title words (like "bandhu") slip through
            const extraNonReqTokens = effectiveCandTokens.filter(
              (ct) => !reqTitleTokens.includes(ct)
            );
            const noConflictingWord =
              extraNonReqTokens.length === 0 ||
              (phraseMatch &&
                candRatio >= 0.65 &&
                (artistMatch || albumMatch) &&
                (cand.id.startsWith('dm-') || cand.id.startsWith('yt-')));
            const artistConfirmed =
              reqArtistTokens.length === 0 || artistMatch || albumMatch;
            passesGate = allReqMatched && noConflictingWord && artistConfirmed;
          }

          if (!passesGate) {
            return { cand, score: -1 };
          }

          let score = 0;
          if (cand.id.startsWith('dm-')) score += 60; // Prefer HLS MP4 for background sync
          else if (cand.id.startsWith('yt-')) score += 45; // Full-length YouTube HD video
          if (exactTitle) score += 120;
          else if (phraseMatch) score += 80;
          score += Math.round(reqRatio * 45 + candRatio * 25);
          if (artistMatch) score += 50;
          if (albumMatch) score += 20;
          if (cand.duration >= 120 && cand.duration <= 420) score += 25;
          if (
            /\b(slowed|reverb|8d|cover|karaoke|instrumental|piano)\b/i.test(cand.title) &&
            !/\b(slowed|reverb|8d|cover|karaoke|instrumental|piano)\b/i.test(rawTitle)
          ) {
            score -= 45;
          }

          return { cand, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.cand);
    };

    try {
      const queries = [
        `${reqTitleNorm} ${primaryArtist}`.trim(),
        `${reqTitleNorm} ${reqAlbumNorm}`.trim(),
        reqTitleNorm,
      ].filter((q, idx, arr) => Boolean(q) && arr.indexOf(q) === idx);

      const [dmBatches, ytBatches] = await Promise.all([
        Promise.all(
          queries.slice(0, 2).map((q) => fetchFullVideosFromDailymotion(q, 10).catch(() => []))
        ),
        Promise.all(
          queries
            .slice(0, 2)
            .map((q) =>
              fetchVideosFromYouTube(`${q} official video`, 8)
                .then((r) => r.videos)
                .catch(() => [] as NormalizedTrack[])
            )
        ),
      ]);

      const dmMatched = scoreCandidates(dedupeTracks(dmBatches.flat()));
      if (dmMatched.length > 0) {
        return res.json({
          matched: true,
          video: dmMatched[0],
          candidates: dmMatched,
        });
      }

      const ytMatched = scoreCandidates(dedupeTracks(ytBatches.flat()));
      if (ytMatched.length > 0) {
        return res.json({
          matched: true,
          video: ytMatched[0],
          candidates: ytMatched,
        });
      }

      // If strict gate didn't hit a full YouTube video, check top YouTube full-video query with title + artist
      const fallbackYt = ytBatches[0]?.[0] || null;
      if (fallbackYt && scoreTrackQueryMatch(fallbackYt, `${reqTitleNorm} ${primaryArtist}`) >= 75) {
        return res.json({
          matched: true,
          video: fallbackYt,
          candidates: ytBatches[0].slice(0, 6),
        });
      }

      res.json({
        matched: false,
        video: null,
        candidates: [],
      });
    } catch {
      res.status(502).json({ error: 'Could not match music video.' });
    }
  });

  app.get('/api/music/match-audio', async (req, res) => {
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    if (!rawTitle) {
      return res.json({ track: null });
    }
    const cleanTitle = decodeEntities(rawTitle)
      .replace(/#video|#bhojpuri|#song|#trending|full\s*video|official\s*video|4k\s*video|hd\s*video/gi, ' ')
      .replace(/#\S+/g, ' ')
      .replace(/\|.*$/, ' ')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const q = normalizePhoneticQuery(`${cleanTitle} ${rawArtist}`.trim()) || cleanTitle;
    try {
      const tracks = await fetchSongsFromUpstream(q, 1, 8);
      if (tracks.length === 0) return res.json({ track: null });
      const scored = tracks
        .map((t) => ({ t, score: scoreTrackQueryMatch(t, cleanTitle) }))
        .sort((a, b) => b.score - a.score);
      res.json({
        track: scored[0] && scored[0].score >= 55 ? scored[0].t : null,
      });
    } catch {
      res.json({ track: null });
    }
  });

  app.get('/api/music/discover', async (_req, res) => {
    if (discoverCache && discoverCache.expiresAt > Date.now()) {
      return res.json(discoverCache.payload);
    }

    try {
      const [shelves, playlistRes, albumRes, artistRes, bhojpuriArtistRes] =
        await Promise.all([
          Promise.all(
            DISCOVER_SEEDS.map(async (seed) => {
              try {
                if (seed.kind === 'video') {
                  const dm = await fetchFullVideosFromDailymotion(
                    `${seed.query} full video song`,
                    8
                  );
                  if (dm.length >= 4) return { ...seed, tracks: dm };
                  const yt = await fetchVideosFromYouTube(
                    `${seed.query} official video song`,
                    8
                  ).catch(() => ({ videos: [] as NormalizedTrack[] }));
                  return { ...seed, tracks: dedupeTracks([...dm, ...yt.videos]).slice(0, 8) };
                }
                const tracks = await fetchSongsFromUpstream(seed.query, 1, 8);
                return { ...seed, tracks };
              } catch {
                return { ...seed, tracks: [] };
              }
            })
          ),
          fetchSaavnJson<{ results?: RawSaavnPlaylist[] }>(
            '/search/playlists?query=top%20hindi&limit=8'
          ).catch(() => null),
          fetchSaavnJson<{ results?: RawSaavnAlbum[] }>(
            '/search/albums?query=bollywood%20hits&limit=8'
          ).catch(() => null),
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
              fetchSaavnJson<{ results?: RawSaavnArtist[] }>(
                `/search/artists?query=${encodeURIComponent(singer)}&limit=1`
              ).catch(() => null)
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
              fetchSaavnJson<{ results?: RawSaavnArtist[] }>(
                `/search/artists?query=${encodeURIComponent(singer)}&limit=1`
              ).catch(() => null)
            )
          ),
        ]);

      const populatedShelves = shelves.filter((s) => s.tracks.length > 0);
      const playlists = (playlistRes?.results || [])
        .map(normalizePlaylist)
        .filter((p): p is NonNullable<typeof p> => p !== null);
      const albums = (albumRes?.results || [])
        .map(normalizeAlbum)
        .filter((a): a is NonNullable<typeof a> => a !== null);
      const artists = artistRes
        .map((r) => (r?.results?.[0] ? normalizeArtist(r.results[0]) : null))
        .filter((a): a is NonNullable<typeof a> => a !== null);
      const bhojpuriArtists = bhojpuriArtistRes
        .map((r) => (r?.results?.[0] ? normalizeArtist(r.results[0]) : null))
        .filter((a): a is NonNullable<typeof a> => a !== null);

      const payload = {
        shelves: populatedShelves,
        playlists,
        albums,
        artists,
        bhojpuriArtists,
      };

      if (populatedShelves.length > 0) {
        discoverCache = {
          expiresAt: Date.now() + 10 * 60 * 1000,
          payload,
        };
      }

      res.json(payload);
    } catch (error) {
      console.error('Discover error:', error);
      res.status(502).json({ error: 'Could not load curated music shelves.' });
    }
  });

  app.get('/api/music/suggestions', async (req, res) => {
    const artist = String(req.query.artist || '').trim();
    const excludeId = String(req.query.excludeId || '').trim();
    if (!artist) {
      return res.json({ tracks: [] });
    }

    try {
      const firstArtist = artist.split(',')[0].trim();
      const tracks = await fetchSongsFromUpstream(firstArtist, 1, 10);
      const filtered = tracks.filter((t) => t.id !== excludeId).slice(0, 8);
      res.json({ tracks: filtered });
    } catch {
      res.json({ tracks: [] });
    }
  });

  app.get('/api/music/download', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    const rawName = String(req.query.filename || 'swara-media').trim();
    const kind = String(req.query.kind || 'audio') === 'video' ? 'video' : 'audio';

    if (!rawUrl) {
      return res.status(400).json({ error: 'Download URL is required.' });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid media URL.' });
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return res.status(400).json({ error: 'Unsupported protocol.' });
    }

    const host = parsedUrl.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) {
      return res.status(403).json({ error: 'Forbidden host.' });
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        headers: { 'User-Agent': 'SwaraMusicPlayer/1.0' },
      });

      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ error: 'Media file could not be fetched.' });
      }

      const cleanedUnicode = rawName
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);

      const asciiBase =
        cleanedUnicode
          .replace(/[^a-zA-Z0-9\s._-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/^_+|_+$/g, '') || 'swara-track';

      const extMatch = parsedUrl.pathname.match(/\.(mp3|m4a|mp4|m4v|webm|wav|aac|ogg)$/i);
      const rawExt = extMatch ? extMatch[1].toLowerCase() : '';
      let ext: string;
      if (kind === 'video') {
        ext = rawExt === 'webm' ? 'webm' : 'mp4';
      } else {
        ext = rawExt === 'mp3' || rawExt === 'wav' || rawExt === 'ogg' ? rawExt : 'm4a';
      }

      const finalAsciiName = asciiBase.toLowerCase().endsWith(`.${ext}`)
        ? asciiBase
        : `${asciiBase}.${ext}`;
      const finalUtf8Name = (cleanedUnicode || asciiBase).toLowerCase().endsWith(`.${ext}`)
        ? cleanedUnicode || asciiBase
        : `${cleanedUnicode || asciiBase}.${ext}`;

      const contentType =
        kind === 'audio' && (ext === 'm4a' || rawExt === 'mp4')
          ? 'audio/mp4'
          : upstream.headers.get('content-type') ||
            (kind === 'video' ? 'video/mp4' : 'audio/mp4');
      const contentLength = upstream.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${finalAsciiName}"; filename*=UTF-8''${encodeURIComponent(
          finalUtf8Name
        )}`
      );
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('stream/web').ReadableStream
      );
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
      });
      nodeStream.pipe(res);
    } catch (error) {
      console.error('Download proxy error:', error);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to download media file.' });
      }
    }
  });

  if (!IS_PROD) {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
          ws: process.env.DISABLE_HMR === 'true' ? false : undefined,
        },
        appType: 'spa',
      });
    })();

    vitePromise.catch((err) => {
      console.error('Vite middleware initialization failed:', err);
    });

    app.use((req, res, next) => {
      vitePromise
        .then((vite) => vite.middlewares(req, res, next))
        .catch(next);
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Swara server running at http://localhost:${PORT}`);
  });
}

createServer();
