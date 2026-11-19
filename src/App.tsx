import Hls from 'hls.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  Compass,
  Disc3,
  Film,
  FolderOpen,
  Heart,
  Link2,
  ListMusic,
  Loader2,
  Mic2,
  Music,
  Pause,
  Play,
  Radio,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import heroImage from './assets/images/hero_listening_room_1794531039131.jpg';
import { ArtworkImage } from './components/ArtworkImage';
import { NowPlayingSheet, type YouTubePlayerControls } from './components/NowPlayingSheet';
import { PlayerBar } from './components/PlayerBar';
import { TrackRow } from './components/TrackRow';
import type {
  AlbumSummary,
  AppView,
  ArtistSummary,
  AudioQuality,
  CollectionDetail,
  DiscoverPayload,
  EraFilter,
  PlaylistSummary,
  RepeatMode,
  SearchResponse,
  SortOrder,
  Track,
} from './types/music';
import { formatDuration, selectStreamUrl } from './utils/format';
import {
  fetchCollectionData,
  fetchDiscoverData,
  fetchMatchAudioData,
  fetchMatchVideoData,
  fetchSearchData,
  fetchSuggestionsData,
  fetchVideosCatalogData,
} from './utils/musicClient';

const FAVORITES_STORAGE_KEY = 'swara_favorites_v1';
const QUALITY_STORAGE_KEY = 'swara_quality_v1';

const ERA_OPTIONS: Array<{ id: EraFilter; label: string }> = [
  { id: 'all', label: 'All Eras' },
  { id: 'classic', label: '1950s–70s' },
  { id: 'retro', label: '1980s–90s' },
  { id: 'modern', label: '2000s–10s' },
  { id: 'latest', label: '2020s–New' },
];

const QUICK_SEARCH_WORDS = [
  'Kishore Kumar',
  '90s Romantic',
  'Arijit Singh',
  'Baarish',
  'AR Rahman',
  'Sufi',
  'Lata Mangeshkar',
  '2025 Hits',
];

type SearchTab = 'all' | 'songs' | 'videos' | 'albums' | 'playlists' | 'artists' | 'similar';

function matchesEra(yearStr: string, era: EraFilter): boolean {
  if (era === 'all') return true;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) return false;
  if (era === 'classic') return year < 1980;
  if (era === 'retro') return year >= 1980 && year <= 1999;
  if (era === 'modern') return year >= 2000 && year <= 2019;
  if (era === 'latest') return year >= 2020;
  return true;
}

function sortTracksByOrder(list: Track[], order: SortOrder): Track[] {
  if (order === 'relevance') return list;
  return [...list].sort((a, b) => {
    const ya = parseInt(a.year, 10) || (order === 'oldest' ? 9999 : 0);
    const yb = parseInt(b.year, 10) || (order === 'oldest' ? 9999 : 0);
    return order === 'oldest' ? ya - yb : yb - ya;
  });
}

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioHlsRef = useRef<Hls | null>(null);
  const videoHlsRef = useRef<Hls | null>(null);
  const videoStandaloneRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playTrackRef = useRef<(track: Track, list?: Track[]) => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handlePrevRef = useRef<() => void>(() => {});

  // Navigation & Catalog state
  const [view, setView] = useState<AppView>('discover');
  const [previousView, setPreviousView] = useState<AppView>('discover');
  const [discover, setDiscover] = useState<DiscoverPayload | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchTab, setSearchTab] = useState<SearchTab>('all');
  const [eraFilter, setEraFilter] = useState<EraFilter>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('relevance');

  // Videos view state
  const [videoCatalog, setVideoCatalog] = useState<Track[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videoQuery, setVideoQuery] = useState('');
  const [directVideoUrl, setDirectVideoUrl] = useState('');
  const [showVideoUrlForm, setShowVideoUrlForm] = useState(false);

  // Collection detail (Album / Playlist / Singer)
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  // Favorites & Queue
  const [favorites, setFavorites] = useState<Track[]>(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Track[]) : [];
    } catch {
      return [];
    }
  });
  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [autoplayRadio, setAutoplayRadio] = useState(true);

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [quality, setQuality] = useState<AudioQuality>(() => {
    try {
      const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
      if (saved === '320kbps' || saved === '160kbps' || saved === '96kbps') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return '320kbps';
  });
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [cinemaVisualMode, setCinemaVisualMode] = useState(false);
  const [videoAudioOnlyMode, setVideoAudioOnlyMode] = useState(false);
  const [videoStandalone, setVideoStandalone] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoAutoplayNext, setVideoAutoplayNext] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const ytControlRef = useRef<YouTubePlayerControls | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(''), 2600);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // ignore quota errors
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // ignore
    }
  }, [quality]);

  // Initial Discover fetch (works with Express backend or static GitHub Pages)
  useEffect(() => {
    let active = true;
    setDiscoverLoading(true);
    fetchDiscoverData()
      .then((data) => {
        if (!active) return;
        setDiscover(data);
        setDiscoverError('');
      })
      .catch(() => {
        if (!active) return;
        setDiscoverError('Unable to reach the music catalog. Try searching above.');
      })
      .finally(() => {
        if (active) setDiscoverLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load videos catalog when opening Videos tab
  const loadVideos = useCallback(async (q = 'hindi hits') => {
    setVideosLoading(true);
    try {
      const videos = await fetchVideosCatalogData(q, 24);
      setVideoCatalog(videos);
    } catch {
      setVideoCatalog([]);
    } finally {
      setVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'videos' && videoCatalog.length === 0 && !videosLoading) {
      loadVideos('indian music hits');
    }
  }, [view, videoCatalog.length, videosLoading, loadVideos]);

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const toggleFavorite = useCallback(
    (track: Track) => {
      setFavorites((prev) => {
        const exists = prev.some((t) => t.id === track.id);
        if (exists) {
          showToast(`Removed "${track.title}" from Favorites`);
          return prev.filter((t) => t.id !== track.id);
        }
        showToast(`Saved "${track.title}" to Favorites`);
        return [track, ...prev];
      });
    },
    [showToast]
  );

  const addToQueue = useCallback(
    (track: Track) => {
      setQueue((prev) => [...prev, track]);
      showToast(`Added "${track.title}" to Up Next`);
    },
    [showToast]
  );

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const getActiveMediaElement = useCallback((): HTMLMediaElement | null => {
    if (currentTrack?.kind === 'video' && videoStandaloneRef.current) {
      return videoRef.current;
    }
    return audioRef.current;
  }, [currentTrack?.kind]);

  const attachMediaStream = useCallback(
    (
      el: HTMLMediaElement,
      url: string,
      hlsSlot: { current: Hls | null },
      shouldPlay: boolean,
      onFatalFallback?: () => void
    ) => {
      if (hlsSlot.current) {
        hlsSlot.current.destroy();
        hlsSlot.current = null;
      }

      const isHls =
        url.includes('/api/music/hls-manifest') || /\.m3u8(\?|$)/i.test(url);

      if (isHls && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
        });
        hlsSlot.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (shouldPlay) {
            el.play().catch(() => {
              onFatalFallback?.();
            });
          }
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) {
            hls.destroy();
            if (hlsSlot.current === hls) hlsSlot.current = null;
            onFatalFallback?.();
          }
        });
        hls.loadSource(url);
        hls.attachMedia(el);
        return;
      }

      el.src = url;
      el.load();
      if (shouldPlay) {
        el.play().catch(() => {
          onFatalFallback?.();
        });
      }
    },
    []
  );

  // Core Play Track handler (supports both Audio and Screen-Off Background Full Video)
  const playTrack = useCallback(
    (track: Track, contextList?: Track[]) => {
      const url = selectStreamUrl(track, quality);
      if (!url) {
        showToast('No playable stream found for this item.');
        return;
      }

      if (currentTrack && currentTrack.id !== track.id) {
        setHistory((prev) => [currentTrack, ...prev.slice(0, 29)]);
        setVideoAudioOnlyMode(false);
      } else if (!currentTrack) {
        setVideoAudioOnlyMode(false);
      }

      const isEmbedStream = url.startsWith('yt://') || url.startsWith('dm-embed://');

      // If clicking the exact same track, toggle play/pause
      if (currentTrack?.id === track.id) {
        if (url.startsWith('yt://') && ytControlRef.current) {
          if (isPlaying) ytControlRef.current.pause();
          else ytControlRef.current.play();
          return;
        }
        if (track.kind === 'video' && !videoStandaloneRef.current && !isEmbedStream) {
          const audio = audioRef.current;
          const vid = videoRef.current;
          if (audio) {
            if (audio.paused) {
              audio.play().catch(() => {});
              if (vid && !document.hidden) {
                vid.currentTime = audio.currentTime;
                vid.play().catch(() => {});
              }
            } else {
              audio.pause();
              vid?.pause();
            }
            return;
          }
        } else if (!isEmbedStream) {
          const el = track.kind === 'video' ? videoRef.current : audioRef.current;
          if (el) {
            if (el.paused) {
              el.play().catch(() => {});
            } else {
              el.pause();
            }
            return;
          }
        }
      }

      // Populate upcoming queue from contextList if provided
      let populatedFromContext = false;
      if (contextList && contextList.length > 1) {
        const idx = contextList.findIndex((t) => t.id === track.id);
        if (idx !== -1) {
          const upcoming = contextList.slice(idx + 1);
          if (upcoming.length > 0) {
            setQueue(upcoming);
            populatedFromContext = true;
          }
        }
      }

      // If starting a video without upcoming videos, auto-build a YouTube-style Up Next Video Playlist
      if (track.kind === 'video' && !populatedFromContext) {
        const seedTerm =
          track.artist && track.artist !== 'Music Video' && track.artist !== 'Music Channel'
            ? `${track.artist.split(',')[0]} songs`
            : track.title.replace(/#Video|#\S+|\(.*?\)|\[.*?\]/gi, ' ').trim();
        if (seedTerm) {
          fetchVideosCatalogData(seedTerm, 10)
            .then((related) => {
              const filtered = related.filter((v) => v.id !== track.id);
              if (filtered.length > 0) {
                setQueue((prev) => {
                  const existingVideoIds = new Set(prev.map((q) => q.id));
                  const fresh = filtered.filter((v) => !existingVideoIds.has(v.id));
                  return prev.length === 0 ? fresh : [...prev, ...fresh.slice(0, 6)];
                });
              }
            })
            .catch(() => {});
        }
      }

      videoStandaloneRef.current = false;
      setVideoStandalone(false);

      if (track.kind === 'video') {
        setCinemaVisualMode(false);
        setNowPlayingOpen(true);
      } else {
        if (videoHlsRef.current) {
          videoHlsRef.current.destroy();
          videoHlsRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
        }
        setCinemaVisualMode(false);
      }

      setCurrentTrack(track);
      setCurrentTime(0);
      setDuration(track.duration || 0);
      setIsBuffering(true);
      setIsPlaying(true);

      if (isEmbedStream) {
        // Pause native <audio> & <video> when YouTube / Dailymotion embed player takes over
        if (audioHlsRef.current) {
          audioHlsRef.current.destroy();
          audioHlsRef.current = null;
        }
        if (videoHlsRef.current) {
          videoHlsRef.current.destroy();
          videoHlsRef.current = null;
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.removeAttribute('src');
        }
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
        }
        return;
      }

      // Start HTML5 Audio synchronously inside user gesture so mobile OS
      // keeps playback alive in background & screen-off.
      const audio = audioRef.current;
      if (audio) {
        audio.muted = false;
        audio.volume = isMuted ? 0 : volume;
        audio.playbackRate = playbackRate;
        attachMediaStream(audio, url, audioHlsRef, true, () => {
          setIsPlaying(false);
          setIsBuffering(false);
        });
      }

      if (track.kind === 'video') {
        requestAnimationFrame(() => {
          const vid = videoRef.current;
          if (!vid) return;
          vid.muted = true;
          vid.playbackRate = playbackRate;
          attachMediaStream(vid, url, videoHlsRef, !document.hidden);
        });
      }
    },
    [attachMediaStream, currentTrack, isMuted, isPlaying, playbackRate, quality, showToast, volume]
  );

  // If quality changes mid-playback for an audio track, swap stream cleanly keeping timestamp
  useEffect(() => {
    if (!currentTrack || currentTrack.kind !== 'audio') return;
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    const newUrl = selectStreamUrl(currentTrack, quality);
    if (!newUrl || audio.src === newUrl) return;
    const savedTime = audio.currentTime;
    const wasPlaying = !audio.paused;
    audio.src = newUrl;
    audio.currentTime = savedTime;
    if (wasPlaying) {
      audio.play().catch(() => {});
    }
  }, [quality, currentTrack]);

  // Sync volume & mute to audio, video, and YouTube embed player
  useEffect(() => {
    const effectiveVol = isMuted ? 0 : volume;
    if (audioRef.current) audioRef.current.volume = effectiveVol;
    if (videoRef.current) {
      videoRef.current.volume = effectiveVol;
      if (currentTrack?.kind === 'video' && !videoStandaloneRef.current) {
        videoRef.current.muted = true;
      }
    }
    if (ytControlRef.current) {
      ytControlRef.current.setVolume(volume);
      ytControlRef.current.setMute(isMuted);
    }
  }, [volume, isMuted, currentTrack?.kind, videoStandalone]);

  // Re-sync muted <video> canvas seamlessly when user turns screen back on / returns to tab
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      if (
        currentTrack?.kind === 'video' &&
        !videoStandaloneRef.current &&
        audioRef.current &&
        videoRef.current
      ) {
        const audio = audioRef.current;
        const vid = videoRef.current;
        vid.muted = true;
        vid.playbackRate = audio.playbackRate || 1;
        if (Math.abs(vid.currentTime - audio.currentTime) > 0.25) {
          vid.currentTime = audio.currentTime;
        }
        if (!audio.paused && vid.paused) {
          vid.play().catch(() => {});
        } else if (audio.paused && !vid.paused) {
          vid.pause();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [currentTrack?.kind]);

  const togglePlay = useCallback(() => {
    if (!currentTrack) return;
    const streamUrl = selectStreamUrl(currentTrack, quality);
    if (streamUrl.startsWith('yt://') && ytControlRef.current) {
      if (isPlaying) ytControlRef.current.pause();
      else ytControlRef.current.play();
      return;
    }

    if (currentTrack.kind === 'video' && !videoStandaloneRef.current) {
      const audio = audioRef.current;
      const vid = videoRef.current;
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => {});
        if (vid && !document.hidden) {
          if (Math.abs(vid.currentTime - audio.currentTime) > 0.25) {
            vid.currentTime = audio.currentTime;
          }
          vid.play().catch(() => {});
        }
      } else {
        audio.pause();
        vid?.pause();
      }
      return;
    }

    const el = getActiveMediaElement();
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [currentTrack, getActiveMediaElement, isPlaying, quality]);

  const handleSeek = useCallback(
    (time: number) => {
      if (currentTrack && selectStreamUrl(currentTrack, quality).startsWith('yt://')) {
        ytControlRef.current?.seekTo(time);
        setCurrentTime(time);
        return;
      }
      const el = getActiveMediaElement();
      if (!el) return;
      el.currentTime = time;
      if (
        currentTrack?.kind === 'video' &&
        !videoStandaloneRef.current &&
        videoRef.current
      ) {
        videoRef.current.currentTime = time;
      }
      setCurrentTime(time);
    },
    [currentTrack, getActiveMediaElement, quality]
  );

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
    if (videoRef.current) videoRef.current.playbackRate = rate;
    if (ytControlRef.current) ytControlRef.current.setPlaybackRate(rate);
  }, []);

  const handleNext = useCallback(async () => {
    if (!currentTrack) return;

    if (repeat === 'one') {
      if (selectStreamUrl(currentTrack, quality).startsWith('yt://')) {
        ytControlRef.current?.seekTo(0);
        ytControlRef.current?.play();
        return;
      }
      const el = getActiveMediaElement();
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
      if (
        currentTrack.kind === 'video' &&
        !videoStandaloneRef.current &&
        videoRef.current
      ) {
        videoRef.current.currentTime = 0;
        if (!document.hidden) videoRef.current.play().catch(() => {});
      }
      return;
    }

    if (currentTrack.kind === 'video' && !videoAutoplayNext && repeat === 'off') {
      setIsPlaying(false);
      return;
    }

    if (queue.length > 0) {
      const nextIndex = shuffle ? Math.floor(Math.random() * queue.length) : 0;
      const nextTrack = queue[nextIndex];
      const remaining = queue.filter((_, idx) => idx !== nextIndex);
      if (repeat === 'all') {
        remaining.push(currentTrack);
      }
      setQueue(remaining);
      playTrack(nextTrack);
      return;
    }

    if (repeat === 'all') {
      if (selectStreamUrl(currentTrack, quality).startsWith('yt://')) {
        ytControlRef.current?.seekTo(0);
        ytControlRef.current?.play();
        return;
      }
      const el = getActiveMediaElement();
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
      if (
        currentTrack.kind === 'video' &&
        !videoStandaloneRef.current &&
        videoRef.current
      ) {
        videoRef.current.currentTime = 0;
        if (!document.hidden) videoRef.current.play().catch(() => {});
      }
      return;
    }

    if (currentTrack.kind === 'video' && videoAutoplayNext) {
      try {
        const seed =
          currentTrack.artist && currentTrack.artist !== 'Music Channel'
            ? `${currentTrack.artist.split(',')[0]} songs`
            : currentTrack.title.replace(/#Video|#\S+|\(.*?\)|\[.*?\]/gi, ' ').trim();
        const videos = await fetchVideosCatalogData(seed || 'hindi hits', 10);
        const filtered = videos.filter((v) => v.id !== currentTrack.id);
        if (filtered.length > 0) {
          const [first, ...rest] = filtered;
          setQueue(rest);
          playTrack(first);
          return;
        }
      } catch {
        // fallback
      }
    }

    if (autoplayRadio && currentTrack.kind === 'audio') {
      try {
        const tracks = await fetchSuggestionsData(currentTrack.artist, currentTrack.id);
        if (tracks.length > 0) {
          const [first, ...rest] = tracks;
          setQueue(rest);
          playTrack(first);
          return;
        }
      } catch {
        // fallback to stop
      }
    }

    setIsPlaying(false);
  }, [autoplayRadio, currentTrack, getActiveMediaElement, playTrack, quality, queue, repeat, shuffle, videoAutoplayNext]);

  const handlePrev = useCallback(() => {
    const el = getActiveMediaElement();
    if (el && el.currentTime > 4) {
      handleSeek(0);
      return;
    }
    if (history.length > 0) {
      const [prevTrack, ...restHistory] = history;
      setHistory(restHistory);
      if (currentTrack) {
        setQueue((q) => [currentTrack, ...q]);
      }
      playTrack(prevTrack);
    } else if (el) {
      handleSeek(0);
    }
  }, [currentTrack, getActiveMediaElement, handleSeek, history, playTrack]);

  useEffect(() => {
    playTrackRef.current = playTrack;
    handleNextRef.current = handleNext;
    handlePrevRef.current = handlePrev;
  }, [playTrack, handleNext, handlePrev]);

  // MediaSession API: Lock Screen & Background controls for BOTH Audio & Video
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    const artworkList: MediaImage[] = [];
    if (currentTrack.artwork.large) {
      artworkList.push({ src: currentTrack.artwork.large, sizes: '512x512', type: 'image/jpeg' });
    }
    if (currentTrack.artwork.medium) {
      artworkList.push({ src: currentTrack.artwork.medium, sizes: '150x150', type: 'image/jpeg' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: `${currentTrack.album}${currentTrack.year ? ` (${currentTrack.year})` : ''}`,
      artwork: artworkList,
    });

    const getEl = () =>
      currentTrack.kind === 'video' && videoStandaloneRef.current
        ? videoRef.current
        : audioRef.current;

    navigator.mediaSession.setActionHandler('play', () => {
      const el = getEl();
      el?.play().catch(() => {});
      if (
        currentTrack.kind === 'video' &&
        !videoStandaloneRef.current &&
        videoRef.current &&
        !document.hidden &&
        el
      ) {
        videoRef.current.currentTime = el.currentTime;
        videoRef.current.play().catch(() => {});
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      getEl()?.pause();
      if (currentTrack.kind === 'video' && !videoStandaloneRef.current) {
        videoRef.current?.pause();
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      handlePrevRef.current();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      handleNextRef.current();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const el = getEl();
      if (el && typeof details.seekTime === 'number') {
        el.currentTime = details.seekTime;
        if (
          currentTrack.kind === 'video' &&
          !videoStandaloneRef.current &&
          videoRef.current
        ) {
          videoRef.current.currentTime = details.seekTime;
        }
        setCurrentTime(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const el = getEl();
      if (el) {
        const next = Math.max(0, el.currentTime - (details.seekOffset || 10));
        el.currentTime = next;
        if (
          currentTrack.kind === 'video' &&
          !videoStandaloneRef.current &&
          videoRef.current
        ) {
          videoRef.current.currentTime = next;
        }
        setCurrentTime(next);
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const el = getEl();
      if (el) {
        const next = Math.min(el.duration || 0, el.currentTime + (details.seekOffset || 10));
        el.currentTime = next;
        if (
          currentTrack.kind === 'video' &&
          !videoStandaloneRef.current &&
          videoRef.current
        ) {
          videoRef.current.currentTime = next;
        }
        setCurrentTime(next);
      }
    });
  }, [currentTrack]);

  // Keep MediaSession playbackState & positionState synced
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    const el = getActiveMediaElement();
    if (
      el &&
      Number.isFinite(el.duration) &&
      el.duration > 0 &&
      'setPositionState' in navigator.mediaSession
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: el.duration,
          playbackRate: el.playbackRate || 1,
          position: Math.min(el.currentTime, el.duration),
        });
      } catch {
        // ignore invalid position bounds
      }
    }
  }, [isPlaying, currentTime, getActiveMediaElement]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea';

      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (isTyping) return;

      if (e.code === 'Space' && currentTrack) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' && currentTrack) {
        const el = getActiveMediaElement();
        if (el) handleSeek(Math.min(el.duration || 0, el.currentTime + 5));
      } else if (e.key === 'ArrowLeft' && currentTrack) {
        const el = getActiveMediaElement();
        if (el) handleSeek(Math.max(0, el.currentTime - 5));
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTrack, getActiveMediaElement, handleSeek, togglePlay]);

  // Search Execution
  const runSearch = useCallback(async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) return;
    setSearchQuery(clean);
    setSubmittedQuery(clean);
    setView('search');
    setSearchLoading(true);
    setSearchError('');
    setSearchTab('all');
    setSelectedYear('all');

    try {
      const data = await fetchSearchData(clean, 24);
      setSearchResults(data);
    } catch {
      setSearchError('Could not load search results. Please try again.');
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  // Drill into Album, Playlist, or Singer
  const openCollection = useCallback(
    async (type: 'album' | 'playlist' | 'artist', id: string, nameFallback?: string) => {
      if (view !== 'detail') setPreviousView(view);
      setView('detail');
      setDetailLoading(true);
      setDetailError('');
      setDetail(null);
      setSelectedYear('all');

      try {
        const data = await fetchCollectionData(type, id, nameFallback);
        setDetail(data);
      } catch {
        setDetailError('Could not load details right now. Please go back and try again.');
      } finally {
        setDetailLoading(false);
      }
    },
    [view]
  );

  // Open local MP3 / MP4 / WebM / M4A files directly from device (100% ad-free)
  const handleLocalFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const localTracks: Track[] = files.map((file, idx) => {
      const isVid = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
      const url = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      return {
        id: `local-${Date.now()}-${idx}`,
        kind: isVid ? 'video' : 'audio',
        title: cleanName,
        artist: 'Local Device Media',
        album: isVid ? 'Local Video' : 'Local Audio',
        year: new Date(file.lastModified).getFullYear().toString(),
        releaseDate: new Date(file.lastModified).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        duration: 0,
        language: isVid ? 'Video' : 'Audio',
        artwork: { small: '', medium: '', large: '' },
        streams: [{ quality: 'Local', url }],
      };
    });

    playTrack(localTracks[0], localTracks);
    showToast(
      localTracks.length > 1
        ? `Playing ${localTracks[0].title} (+${localTracks.length - 1} queued)`
        : `Playing local file: ${localTracks[0].title}`
    );
    e.target.value = '';
  };

  const playCollectionNonstop = (tracks: Track[], shuffled = false) => {
    if (tracks.length === 0) return;
    const list = shuffled ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    playTrack(list[0], list);
    showToast(`Playing ${list.length} tracks non-stop`);
  };

  const addManyToQueue = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) return;
      setQueue((prev) => {
        const next = [...prev];
        next.push(...tracks);
        return next;
      });
      showToast(`Added ${tracks.length} songs to Up Next queue`);
    },
    [showToast]
  );

  const availableSearchYears = useMemo(() => {
    if (!searchResults) return [];
    const years = new Set<string>();
    for (const t of [
      ...searchResults.tracks,
      ...searchResults.similar,
      ...searchResults.videos,
    ]) {
      if (t.year && /^\d{4}$/.test(t.year)) years.add(t.year);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [searchResults]);

  const availableDetailYears = useMemo(() => {
    if (!detail) return [];
    const years = new Set<string>();
    for (const t of detail.tracks) {
      if (t.year && /^\d{4}$/.test(t.year)) years.add(t.year);
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [detail]);

  const filteredSearchTracks = useMemo(() => {
    if (!searchResults) return [];
    const matched = searchResults.tracks.filter(
      (t) =>
        matchesEra(t.year, eraFilter) &&
        (selectedYear === 'all' || t.year === selectedYear)
    );
    return sortTracksByOrder(matched, sortOrder);
  }, [searchResults, eraFilter, selectedYear, sortOrder]);

  const filteredSearchSimilar = useMemo(() => {
    if (!searchResults) return [];
    const matched = searchResults.similar.filter(
      (t) =>
        matchesEra(t.year, eraFilter) &&
        (selectedYear === 'all' || t.year === selectedYear)
    );
    return sortTracksByOrder(matched, sortOrder);
  }, [searchResults, eraFilter, selectedYear, sortOrder]);

  const filteredSearchVideos = useMemo(() => {
    if (!searchResults) return [];
    const matched = searchResults.videos.filter(
      (t) =>
        matchesEra(t.year, eraFilter) &&
        (selectedYear === 'all' || t.year === selectedYear)
    );
    return sortTracksByOrder(matched, sortOrder);
  }, [searchResults, eraFilter, selectedYear, sortOrder]);

  const filteredVideoCatalog = useMemo(() => {
    const matched = videoCatalog.filter((t) => matchesEra(t.year, eraFilter));
    return sortTracksByOrder(matched, sortOrder);
  }, [videoCatalog, eraFilter, sortOrder]);

  const filteredDetailTracks = useMemo(() => {
    if (!detail) return [];
    const matched = detail.tracks.filter(
      (t) =>
        matchesEra(t.year, eraFilter) &&
        (selectedYear === 'all' || t.year === selectedYear)
    );
    return sortTracksByOrder(matched, sortOrder);
  }, [detail, eraFilter, selectedYear, sortOrder]);

  const watchVideoForTrack = useCallback(
    async (track: Track) => {
      const cleanTitle = track.title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
      const artist = track.primaryArtistName || track.artist.split(',')[0].trim();
      showToast(`Checking video for "${cleanTitle}"...`);
      try {
        const data = await fetchMatchVideoData(
          cleanTitle,
          artist,
          track.album || ''
        );
        if (data.matched && data.video) {
          setCinemaVisualMode(false);
          setVideoAudioOnlyMode(false);
          playTrack(
            data.video,
            data.candidates && data.candidates.length > 0 ? data.candidates : [data.video]
          );
          return;
        }

        // Exact video not in catalog — never substitute a random song's video.
        // Keep or start the exact requested song in Cinema Visual Mode.
        if (currentTrack?.id !== track.id) {
          playTrack(track);
        } else if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
        }
        setCinemaVisualMode(true);
        setNowPlayingOpen(true);
        showToast(`Official video unavailable for "${cleanTitle}" — Cinema Visual active`);
      } catch {
        if (currentTrack?.id !== track.id) {
          playTrack(track);
        }
        setCinemaVisualMode(true);
        setNowPlayingOpen(true);
        showToast('Switched to synced Cinema Visual for your song.');
      }
    },
    [currentTrack?.id, playTrack, showToast]
  );

  const switchToAudioForTrack = useCallback(
    async (track: Track) => {
      const cleanLabel =
        track.title
          .replace(/#\S+/g, ' ')
          .replace(/\|.*$/, ' ')
          .replace(/\(.*?\)|\[.*?\]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || track.title;
      const artist = track.primaryArtistName || track.artist.split(',')[0].trim();
      showToast(`Switching to audio for "${cleanLabel}"...`);

      try {
        const directAudio = await fetchMatchAudioData(
          track.title,
          artist,
          track.duration || 0
        );
        if (directAudio) {
          setVideoAudioOnlyMode(false);
          playTrack(directAudio);
          return;
        }

        // Standalone MP3 is not available — never play a wrong song!
        // Keep playing this exact track's own stream in Audio Cover + Synced Lyrics view.
        if (currentTrack?.id !== track.id) {
          playTrack(track);
        }
        setVideoAudioOnlyMode(true);
        setNowPlayingOpen(true);
        showToast(`Playing exact audio for "${cleanLabel}"`);
      } catch {
        if (currentTrack?.id !== track.id) {
          playTrack(track);
        }
        setVideoAudioOnlyMode(true);
        setNowPlayingOpen(true);
        showToast(`Playing exact audio for "${cleanLabel}"`);
      }
    },
    [currentTrack?.id, playTrack, showToast]
  );

  const handleDirectVideoSubmit = (e: FormEvent) => {
    e.preventDefault();
    const url = directVideoUrl.trim();
    if (!url) return;
    const customVideo: Track = {
      id: `url-video-${Date.now()}`,
      kind: 'video',
      title: url.split('/').pop()?.split('?')[0] || 'Custom Video Stream',
      artist: 'Direct Video Stream',
      album: 'Ad-Free Video Theater',
      year: new Date().getFullYear().toString(),
      releaseDate: 'Direct Stream',
      duration: 0,
      language: 'Video',
      artwork: { small: '', medium: '', large: '' },
      streams: [{ quality: 'HD Video', url }],
    };
    playTrack(customVideo);
    setDirectVideoUrl('');
    setShowVideoUrlForm(false);
  };

  const currentVideoStreamUrl =
    currentTrack?.kind === 'video' ? selectStreamUrl(currentTrack, quality) : '';

  const cycleRepeat = () => {
    setRepeat((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  };

  const cycleQuality = () => {
    setQuality((prev) =>
      prev === '320kbps' ? '160kbps' : prev === '160kbps' ? '96kbps' : '320kbps'
    );
  };

  const handleEraShortcut = (era: EraFilter) => {
    setEraFilter(era);
    const eraQueries: Record<EraFilter, string> = {
      all: 'hindi hits',
      classic: 'kishore kumar lata mangeshkar classics',
      retro: '90s bollywood romantic hits',
      modern: '2010s bollywood hits arijit pritam',
      latest: 'new hindi songs 2025',
    };
    runSearch(eraQueries[era]);
  };

  const handleOpenBhojpuriArtists = () => {
    setView('discover');
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById('bhojpuri-artists-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          runSearch('pawan singh khesari lal bhojpuri hits');
        }
      }, 60);
    });
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F3F4F6] flex flex-col md:flex-row">
      {/* Hidden persistent HTML5 Audio element for background MP3/AAC & Screen-Off Video audio */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (currentTrack?.kind === 'video' && videoStandaloneRef.current) return;
          setCurrentTime(audio.currentTime);

          // Keep visible muted <video> frame-synced while screen is on
          if (
            currentTrack?.kind === 'video' &&
            !videoStandaloneRef.current &&
            videoRef.current &&
            !document.hidden
          ) {
            const vid = videoRef.current;
            vid.muted = true;
            if (!audio.paused && vid.paused && vid.readyState >= 2) {
              vid.play().catch(() => {});
            }
            if (Math.abs(vid.currentTime - audio.currentTime) > 0.45 && vid.readyState >= 2) {
              vid.currentTime = audio.currentTime;
            }
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
          setIsBuffering(false);
        }}
        onPlay={() => {
          setIsPlaying(true);
          setIsBuffering(false);
          if (
            currentTrack?.kind === 'video' &&
            !videoStandaloneRef.current &&
            videoRef.current &&
            audioRef.current &&
            !document.hidden
          ) {
            const vid = videoRef.current;
            vid.muted = true;
            if (Math.abs(vid.currentTime - audioRef.current.currentTime) > 0.3) {
              vid.currentTime = audioRef.current.currentTime;
            }
            if (vid.paused) vid.play().catch(() => {});
          }
        }}
        onPause={() => {
          if (currentTrack?.kind === 'video' && videoStandaloneRef.current) return;
          setIsPlaying(false);
          if (
            currentTrack?.kind === 'video' &&
            !videoStandaloneRef.current &&
            videoRef.current &&
            !videoRef.current.paused
          ) {
            videoRef.current.pause();
          }
        }}
        onWaiting={() => {
          if (currentTrack?.kind === 'video' && videoStandaloneRef.current) return;
          setIsBuffering(true);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onEnded={() => {
          if (currentTrack?.kind === 'video' && videoStandaloneRef.current) return;
          handleNextRef.current();
        }}
        onError={() => {
          // If <audio> fails to decode an exotic video container, fall back to standalone <video>
          if (currentTrack?.kind === 'video' && !videoStandaloneRef.current && videoRef.current) {
            videoStandaloneRef.current = true;
            setVideoStandalone(true);
            audioRef.current?.removeAttribute('src');
            videoRef.current.muted = isMuted;
            videoRef.current.volume = isMuted ? 0 : volume;
            videoRef.current.play().catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
            });
            return;
          }
          setIsBuffering(false);
          setIsPlaying(false);
          showToast('Stream unavailable for this track. Trying next...');
          handleNextRef.current();
        }}
      />

      {/* Hidden local file input for device MP3 & MP4 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/*,.mp3,.m4a,.wav,.mp4,.webm,.mkv,.mov"
        multiple
        onChange={handleLocalFiles}
        className="hidden"
      />

      {/* Desktop Left Navigation Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 lg:w-68 shrink-0 bg-[#0F1115] border-r border-white/[0.06] h-screen sticky top-0 px-4 py-6 overflow-y-auto">
        <div className="px-2 mb-7">
          <button
            type="button"
            onClick={() => setView('discover')}
            className="text-left focus-visible:outline-none"
          >
            <span className="font-display text-2xl font-bold tracking-tight text-white">
              Swara
            </span>
          </button>
          <p className="text-xs text-zinc-500 mt-1">
            Ad-Free Audio & Video
          </p>
        </div>

        <nav className="space-y-1" aria-label="Primary navigation">
          {(
            [
              { id: 'discover', label: 'Discover', icon: Compass },
              { id: 'search', label: 'Search All', icon: Search },
              { id: 'videos', label: 'Music Videos', icon: Film },
              { id: 'favorites', label: `Favorites (${favorites.length})`, icon: Heart },
              { id: 'queue', label: `Up Next (${queue.length})`, icon: ListMusic },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={18} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-7 pt-5 border-t border-white/[0.06]">
          <p className="px-2 text-xs font-medium text-zinc-500 mb-2.5">
            Old to New Eras
          </p>
          <div className="space-y-1">
            {ERA_OPTIONS.filter((e) => e.id !== 'all').map((era) => (
              <button
                key={era.id}
                type="button"
                onClick={() => handleEraShortcut(era.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  eraFilter === era.id && view === 'search'
                    ? 'bg-white/[0.08] text-emerald-400'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                }`}
              >
                <span>{era.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-white/[0.06]">
          <p className="px-2 text-xs font-medium text-zinc-500 mb-2.5">
            Regional Artists
          </p>
          <button
            type="button"
            onClick={handleOpenBhojpuriArtists}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-colors"
          >
            <Mic2 size={14} />
            <span>Bhojpuri Artists</span>
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.07] transition-colors whitespace-nowrap"
          >
            <FolderOpen size={15} />
            <span>Open Local MP3 / MP4</span>
          </button>
        </div>

        <div className="mt-auto pt-6">
          <div className="px-2">
            <p className="text-xs text-zinc-500 mb-2">Audio Stream Bitrate</p>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-white/[0.04]">
              {(['320kbps', '160kbps', '96kbps'] as AudioQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`py-1.5 text-[11px] font-mono tabular-nums rounded-md transition-colors ${
                    quality === q
                      ? 'bg-emerald-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {q.replace('kbps', 'k')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col pb-28 md:pb-24">
        {/* Top Search Header */}
        <header className="border-b border-white/[0.06] bg-[#0B0C0E]/90 backdrop-blur-md px-4 sm:px-8 py-3.5">
          <div className="max-w-6xl mx-auto flex items-center gap-3 sm:gap-6">
            <button
              type="button"
              onClick={() => setView('discover')}
              className="md:hidden font-display text-xl font-bold text-white whitespace-nowrap shrink-0"
            >
              Swara
            </button>

            <form
              onSubmit={handleSearchSubmit}
              className="flex-1 flex items-center gap-2 max-w-2xl"
            >
              <div className="relative flex-1">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search song, singer, album, or any word..."
                  className="w-full h-11 pl-10 pr-9 rounded-xl bg-[#14171C] border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-200"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="h-11 px-4 sm:px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Search
              </button>
            </form>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200 shrink-0"
              aria-label="Open local MP3 or MP4 file"
              title="Open Local MP3 / MP4"
            >
              <FolderOpen size={18} />
            </button>
          </div>
        </header>

        {/* Main Scrollable Canvas */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-6xl w-full mx-auto space-y-10">
          {/* DISCOVER VIEW */}
          {view === 'discover' && (
            <>
              {/* Hero Studio Listening Banner */}
              <section className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#121419]">
                <div className="grid lg:grid-cols-[1.15fr_1fr] items-stretch">
                  <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center relative z-10">
                    <p className="text-xs font-medium text-emerald-400 tracking-wide">
                      Songs · Albums · Playlists · Music Videos
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight mt-2 text-balance">
                      Non-stop, ad-free music from 1950s classics to 2026 hits
                    </h1>
                    <p className="text-sm text-zinc-300 mt-3 max-w-xl leading-relaxed">
                      Search any word to discover matching tracks, albums, singers, and similar songs. Play audio or HD videos cleanly with background lock-screen controls.
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          const firstShelf = discover?.shelves[0];
                          if (firstShelf && firstShelf.tracks.length > 0) {
                            playCollectionNonstop(firstShelf.tracks);
                          } else {
                            runSearch('top hindi hits');
                          }
                        }}
                        className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Play size={16} className="fill-zinc-950" />
                        <span>Play Non-Stop Mix</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-11 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-100 font-medium text-sm inline-flex items-center gap-2 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0"
                      >
                        <FolderOpen size={16} />
                        <span>Play Local MP3 / Video</span>
                      </button>
                    </div>
                  </div>

                  <div className="relative min-h-[210px] lg:min-h-[290px]">
                    <img
                      src={heroImage}
                      alt="Minimalist studio listening room with tube amplifier and vinyl turntable"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#121419] via-[#121419]/40 to-transparent" />
                  </div>
                </div>
              </section>

              {/* Quick Word / Mood Search Bar */}
              <section>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="font-display text-lg font-semibold text-white">
                    Browse by Mood, Era & Keyword
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SEARCH_WORDS.map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => runSearch(word)}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium bg-[#14171C] hover:bg-[#1B1F27] text-zinc-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </section>

              {discoverLoading && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 size={16} className="animate-spin text-emerald-400" />
                    <span>Loading singers, albums, playlists, and era shelves...</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="h-48 rounded-xl bg-[#14171C] animate-pulse border border-white/[0.04]"
                      />
                    ))}
                  </div>
                </div>
              )}

              {discoverError && !discoverLoading && (
                <div className="p-6 rounded-xl bg-[#14171C] border border-white/[0.08] text-sm text-zinc-300">
                  {discoverError}
                </div>
              )}

              {/* Singer by Singer Section */}
              {discover?.artists && discover.artists.length > 0 && (
                <section>
                  <div className="flex items-end justify-between gap-4 mb-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-white">
                        Singer by Singer
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Open any artist for their full song & album catalog
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {discover.artists.map((artist) => (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => openCollection('artist', artist.id, artist.name)}
                        className="group flex flex-col items-center text-center p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
                      >
                        <ArtworkImage
                          src={artist.artwork.medium || artist.artwork.small}
                          alt={artist.name}
                          className="w-20 h-20 rounded-full object-cover mb-2.5 group-hover:scale-[1.03] transition-transform"
                        />
                        <p className="text-xs font-medium text-zinc-100 truncate w-full">
                          {artist.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Bhojpuri Artists Section */}
              {discover?.bhojpuriArtists && discover.bhojpuriArtists.length > 0 && (
                <section id="bhojpuri-artists-section">
                  <div className="flex items-end justify-between gap-4 mb-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold text-white">
                        Bhojpuri Artists
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Pawan Singh, Khesari Lal Yadav, Shilpi Raj, Nirahua & more superhit Bhojpuri singers
                      </p>
                    </div>
                    {discover.shelves.find((s) => s.id === 'bhojpuri-hits') && (
                      <button
                        type="button"
                        onClick={() => {
                          const shelf = discover.shelves.find(
                            (s) => s.id === 'bhojpuri-hits'
                          );
                          if (shelf) playCollectionNonstop(shelf.tracks);
                        }}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition-colors whitespace-nowrap shrink-0"
                      >
                        Play Bhojpuri Hits
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                    {discover.bhojpuriArtists.map((artist) => (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => openCollection('artist', artist.id, artist.name)}
                        className="group flex flex-col items-center text-center p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
                      >
                        <ArtworkImage
                          src={artist.artwork.medium || artist.artwork.small}
                          alt={artist.name}
                          className="w-20 h-20 rounded-full object-cover mb-2.5 group-hover:scale-[1.03] transition-transform"
                        />
                        <p className="text-xs font-medium text-zinc-100 truncate w-full">
                          {artist.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Curated Playlists */}
              {discover?.playlists && discover.playlists.length > 0 && (
                <section>
                  <div className="mb-4">
                    <h2 className="font-display text-xl font-semibold text-white">
                      Non-Stop Playlists
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Curated mixes ready for continuous playback
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {discover.playlists.slice(0, 8).map((pl) => (
                      <button
                        key={pl.id}
                        type="button"
                        onClick={() => openCollection('playlist', pl.id)}
                        className="group text-left p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
                      >
                        <div className="aspect-square rounded-lg overflow-hidden mb-3">
                          <ArtworkImage
                            src={pl.artwork.large || pl.artwork.medium}
                            alt={pl.title}
                            className="w-full h-full group-hover:scale-[1.03] transition-transform"
                          />
                        </div>
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {pl.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {pl.language || 'Playlist'}
                          {pl.songCount ? ` · ${pl.songCount} songs` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Album by Album */}
              {discover?.albums && discover.albums.length > 0 && (
                <section>
                  <div className="mb-4">
                    <h2 className="font-display text-xl font-semibold text-white">
                      Album by Album
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Explore complete soundtracks with launch years
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {discover.albums.slice(0, 8).map((album) => (
                      <button
                        key={album.id}
                        type="button"
                        onClick={() => openCollection('album', album.id)}
                        className="group text-left p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
                      >
                        <div className="aspect-square rounded-lg overflow-hidden mb-3">
                          <ArtworkImage
                            src={album.artwork.large || album.artwork.medium}
                            alt={album.title}
                            className="w-full h-full group-hover:scale-[1.03] transition-transform"
                          />
                        </div>
                        <p className="text-sm font-medium text-zinc-100 truncate">
                          {album.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">
                          {album.artist}
                          {album.year ? ` · ${album.year}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Era Shelves: Old to New + Music Videos */}
              {discover?.shelves.map((shelf) => (
                <section key={shelf.id}>
                  <div className="flex items-end justify-between gap-4 mb-4">
                    <div>
                      <p className="text-xs font-mono text-emerald-400 mb-0.5">
                        {shelf.eraLabel}
                      </p>
                      <h2 className="font-display text-xl font-semibold text-white">
                        {shelf.title}
                      </h2>
                      <p className="text-xs text-zinc-400 mt-0.5">{shelf.subtitle}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => playCollectionNonstop(shelf.tracks)}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      Play All
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {shelf.tracks.slice(0, 6).map((track, idx) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        index={idx}
                        isCurrent={currentTrack?.id === track.id}
                        isPlaying={isPlaying}
                        isFavorite={favoriteIds.has(track.id)}
                        onPlay={(t) => playTrack(t, shelf.tracks)}
                        onToggleFavorite={toggleFavorite}
                        onAddToQueue={addToQueue}
                        onOpenArtist={(id, name) => openCollection('artist', id, name)}
                        onOpenAlbum={(albumId) => openCollection('album', albumId)}
                        onWatchVideo={watchVideoForTrack}
                        onSwitchToAudio={switchToAudioForTrack}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}

          {/* SEARCH VIEW */}
          {view === 'search' && (
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    {submittedQuery
                      ? `Results for "${submittedQuery}"`
                      : 'Search Songs, Videos, Albums & Singers'}
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1">
                    Type any word to find matching songs, albums, launch dates, music videos, and similar tracks
                  </p>
                </div>

                {/* Date / Era Sort Controls */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#14171C] border border-white/[0.06] self-start sm:self-auto">
                  <ArrowUpDown size={14} className="text-zinc-500 ml-2 mr-1" />
                  {(
                    [
                      { id: 'relevance', label: 'Best Match' },
                      { id: 'oldest', label: 'Oldest First' },
                      { id: 'newest', label: 'Newest First' },
                    ] as Array<{ id: SortOrder; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSortOrder(opt.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        sortOrder === opt.id
                          ? 'bg-emerald-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Era Filter & Year Dropdown Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {ERA_OPTIONS.map((era) => (
                    <button
                      key={era.id}
                      type="button"
                      onClick={() => {
                        setEraFilter(era.id);
                        setSelectedYear('all');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                        eraFilter === era.id
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                          : 'bg-[#14171C] text-zinc-400 border-white/[0.06] hover:text-zinc-100'
                      }`}
                    >
                      {era.label}
                    </button>
                  ))}
                </div>

                {availableSearchYears.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>Launch Year:</span>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[#14171C] border border-white/[0.08] text-xs font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="all">All Years</option>
                      {availableSearchYears.map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* Category Tabs */}
              {searchResults && (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121419] border border-white/[0.06] overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'songs', label: `Songs (${filteredSearchTracks.length})` },
                      { id: 'similar', label: `Similar (${filteredSearchSimilar.length})` },
                      { id: 'videos', label: `Videos (${filteredSearchVideos.length})` },
                      { id: 'albums', label: `Albums (${searchResults.albums.length})` },
                      { id: 'playlists', label: `Playlists (${searchResults.playlists.length})` },
                      { id: 'artists', label: `Singers (${searchResults.artists.length})` },
                    ] as Array<{ id: SearchTab; label: string }>
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSearchTab(tab.id)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        searchTab === tab.id
                          ? 'bg-[#1F242D] text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {!submittedQuery && !searchLoading && (
                <div className="p-8 rounded-2xl bg-[#121419] border border-white/[0.06] text-center space-y-4">
                  <p className="text-sm text-zinc-300">
                    Search any song word, singer name, movie album, or decade above, or pick a quick starter:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {QUICK_SEARCH_WORDS.map((word) => (
                      <button
                        key={word}
                        type="button"
                        onClick={() => runSearch(word)}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 transition-colors"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchLoading && (
                <div className="flex items-center gap-3 py-12 justify-center text-sm text-zinc-400">
                  <Loader2 size={20} className="animate-spin text-emerald-400" />
                  <span>Searching songs, albums, videos, and similar matches...</span>
                </div>
              )}

              {searchError && !searchLoading && (
                <div className="p-5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-200">
                  {searchError}
                </div>
              )}

              {searchResults && !searchLoading && (
                <div className="space-y-9">
                  {searchResults.correctedQuery && (
                    <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-zinc-300 flex flex-wrap items-center gap-1.5">
                      <span>Showing smart match results including:</span>
                      <button
                        type="button"
                        onClick={() => runSearch(searchResults.correctedQuery!)}
                        className="font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                      >
                        {searchResults.correctedQuery}
                      </button>
                    </div>
                  )}

                  {/* Direct Matching Songs */}
                  {(searchTab === 'all' || searchTab === 'songs') && (
                    <div>
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <h2 className="font-display text-lg font-semibold text-white">
                          Songs ({filteredSearchTracks.length})
                        </h2>
                        {filteredSearchTracks.length > 0 && (
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => addManyToQueue(filteredSearchTracks)}
                              className="text-xs font-medium text-zinc-300 hover:text-white"
                            >
                              Queue All Results
                            </button>
                            <button
                              type="button"
                              onClick={() => playCollectionNonstop(filteredSearchTracks)}
                              className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                            >
                              Play All Non-Stop
                            </button>
                          </div>
                        )}
                      </div>

                      {filteredSearchTracks.length === 0 ? (
                        <p className="text-sm text-zinc-500 py-4">
                          No songs match this year/era filter. Try selecting "All Years" or "All Eras".
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {filteredSearchTracks.map((track, idx) => (
                            <TrackRow
                              key={track.id}
                              track={track}
                              index={idx}
                              isCurrent={currentTrack?.id === track.id}
                              isPlaying={isPlaying}
                              isFavorite={favoriteIds.has(track.id)}
                              onPlay={(t) => playTrack(t, filteredSearchTracks)}
                              onToggleFavorite={toggleFavorite}
                              onAddToQueue={addToQueue}
                              onOpenArtist={(id, name) => openCollection('artist', id, name)}
                              onOpenAlbum={(albumId) => openCollection('album', albumId)}
                              onWatchVideo={watchVideoForTrack}
                              onSwitchToAudio={switchToAudioForTrack}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Milte Julte (Similar) Songs */}
                  {(searchTab === 'all' || searchTab === 'similar') &&
                    filteredSearchSimilar.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <Sparkles size={16} className="text-emerald-400" />
                            <h2 className="font-display text-lg font-semibold text-white">
                              Similar & Related Songs (Milte Julte)
                            </h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => playCollectionNonstop(filteredSearchSimilar)}
                            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                          >
                            Play Similar Mix
                          </button>
                        </div>

                        <div className="space-y-1">
                          {filteredSearchSimilar.map((track, idx) => (
                            <TrackRow
                              key={track.id}
                              track={track}
                              index={idx}
                              isCurrent={currentTrack?.id === track.id}
                              isPlaying={isPlaying}
                              isFavorite={favoriteIds.has(track.id)}
                              onPlay={(t) => playTrack(t, filteredSearchSimilar)}
                              onToggleFavorite={toggleFavorite}
                              onAddToQueue={addToQueue}
                              onOpenArtist={(id, name) => openCollection('artist', id, name)}
                              onOpenAlbum={(albumId) => openCollection('album', albumId)}
                              onWatchVideo={watchVideoForTrack}
                              onSwitchToAudio={switchToAudioForTrack}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Matching Music Videos */}
                  {(searchTab === 'all' || searchTab === 'videos') &&
                    filteredSearchVideos.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Film size={16} className="text-emerald-400" />
                          <h2 className="font-display text-lg font-semibold text-white">
                            Music Videos ({filteredSearchVideos.length})
                          </h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredSearchVideos.map((vid) => (
                            <VideoCard
                              key={vid.id}
                              video={vid}
                              isCurrent={currentTrack?.id === vid.id}
                              onPlay={(v) => playTrack(v, filteredSearchVideos)}
                              onSwitchToAudio={switchToAudioForTrack}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Matching Albums */}
                  {(searchTab === 'all' || searchTab === 'albums') &&
                    searchResults.albums.length > 0 && (
                      <div>
                        <h2 className="font-display text-lg font-semibold text-white mb-3">
                          Albums ({searchResults.albums.length})
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {searchResults.albums.map((album) => (
                            <AlbumCard
                              key={album.id}
                              album={album}
                              onOpen={() => openCollection('album', album.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Matching Playlists */}
                  {(searchTab === 'all' || searchTab === 'playlists') &&
                    searchResults.playlists.length > 0 && (
                      <div>
                        <h2 className="font-display text-lg font-semibold text-white mb-3">
                          Playlists ({searchResults.playlists.length})
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {searchResults.playlists.map((pl) => (
                            <PlaylistCard
                              key={pl.id}
                              playlist={pl}
                              onOpen={() => openCollection('playlist', pl.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Matching Singers */}
                  {(searchTab === 'all' || searchTab === 'artists') &&
                    searchResults.artists.length > 0 && (
                      <div>
                        <h2 className="font-display text-lg font-semibold text-white mb-3">
                          Singers ({searchResults.artists.length})
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {searchResults.artists.map((artist) => (
                            <ArtistCard
                              key={artist.id}
                              artist={artist}
                              onOpen={() => openCollection('artist', artist.id, artist.name)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </section>
          )}

          {/* VIDEOS VIEW */}
          {view === 'videos' && (
            <section className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Ad-Free Music & Local Videos
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1">
                    Watch official music videos, direct MP4/WebM streams, or device videos with Picture-in-Picture & background playback
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  {filteredVideoCatalog.length > 0 && (
                    <button
                      type="button"
                      onClick={() => playCollectionNonstop(filteredVideoCatalog)}
                      className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Play size={14} className="fill-zinc-950" />
                      <span>Play All Videos</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-zinc-100 font-medium text-xs inline-flex items-center gap-2 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0"
                  >
                    <FolderOpen size={15} />
                    <span>Open Local Video</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowVideoUrlForm((v) => !v)}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 font-medium text-xs inline-flex items-center gap-2 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Link2 size={15} />
                    <span>Video URL</span>
                  </button>
                </div>
              </div>

              {/* Active Video Quick Resume Card */}
              {currentTrack?.kind === 'video' && (
                <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[#14181F] border border-emerald-500/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <ArtworkImage
                      src={currentTrack.artwork.medium || currentTrack.artwork.small}
                      alt={currentTrack.title}
                      className="w-16 h-10 rounded-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-emerald-400">
                        Active Video Stream
                      </p>
                      <p className="text-sm font-medium text-white truncate">
                        {currentTrack.title} · {currentTrack.artist}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="h-9 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white inline-flex items-center gap-1.5"
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                      <span>{isPlaying ? 'Pause' : 'Play'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNowPlayingOpen(true)}
                      className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Video size={14} />
                      <span>Open Video Stage</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Direct Video URL Form */}
              {showVideoUrlForm && (
                <form
                  onSubmit={handleDirectVideoSubmit}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-4 rounded-xl bg-[#121419] border border-white/[0.08]"
                >
                  <input
                    type="url"
                    required
                    value={directVideoUrl}
                    onChange={(e) => setDirectVideoUrl(e.target.value)}
                    placeholder="Paste direct .mp4, .m4v, or .webm video link..."
                    className="flex-1 h-10 px-3.5 rounded-lg bg-[#0B0C0E] border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs whitespace-nowrap"
                  >
                    Play Video Stream
                  </button>
                </form>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (videoQuery.trim()) loadVideos(videoQuery.trim());
                  }}
                  className="flex items-center gap-2 flex-1 max-w-md"
                >
                  <input
                    type="text"
                    value={videoQuery}
                    onChange={(e) => setVideoQuery(e.target.value)}
                    placeholder="Search music videos (e.g. Arijit, Diljit, Pop)..."
                    className="flex-1 h-10 px-3.5 rounded-xl bg-[#14171C] border border-white/[0.08] text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-sm font-medium text-white whitespace-nowrap shrink-0"
                  >
                    Find
                  </button>
                </form>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#14171C] border border-white/[0.06]">
                    {(
                      [
                        { id: 'relevance', label: 'Default' },
                        { id: 'oldest', label: 'Oldest First' },
                        { id: 'newest', label: 'Newest First' },
                      ] as Array<{ id: SortOrder; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSortOrder(opt.id)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          sortOrder === opt.id
                            ? 'bg-emerald-500 text-zinc-950 font-semibold'
                            : 'text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {filteredVideoCatalog.length > 0 && (
                    <button
                      type="button"
                      onClick={() => playCollectionNonstop(filteredVideoCatalog)}
                      className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Play size={13} className="fill-zinc-950" />
                      <span>Play Video Playlist</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Video Category Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  'Bollywood Hits',
                  'Bhojpuri Hits',
                  'Pawan Singh',
                  'Khesari Lal Yadav',
                  'Arijit Singh',
                  'Diljit Dosanjh',
                  '90s Hindi',
                  'Punjabi Pop',
                  'AR Rahman',
                ].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setVideoQuery(cat);
                      loadVideos(cat);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#14171C] hover:bg-[#1C2029] text-zinc-300 border border-white/[0.06] transition-colors whitespace-nowrap shrink-0"
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {videosLoading ? (
                <div className="flex items-center gap-3 py-12 justify-center text-sm text-zinc-400">
                  <Loader2 size={20} className="animate-spin text-emerald-400" />
                  <span>Loading ad-free music videos...</span>
                </div>
              ) : filteredVideoCatalog.length === 0 ? (
                <div className="p-8 rounded-xl bg-[#121419] border border-white/[0.06] text-center text-sm text-zinc-400">
                  No videos found for this query or era filter. Try another artist or select "All Eras".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVideoCatalog.map((vid) => (
                    <VideoCard
                      key={vid.id}
                      video={vid}
                      isCurrent={currentTrack?.id === vid.id}
                      onPlay={(v) => playTrack(v, filteredVideoCatalog)}
                      onSwitchToAudio={switchToAudioForTrack}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* COLLECTION DETAIL VIEW (Album / Playlist / Singer) */}
          {view === 'detail' && (
            <section className="space-y-6">
              <button
                type="button"
                onClick={() => setView(previousView === 'detail' ? 'discover' : previousView)}
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>

              {detailLoading && (
                <div className="flex items-center gap-3 py-12 justify-center text-sm text-zinc-400">
                  <Loader2 size={20} className="animate-spin text-emerald-400" />
                  <span>Loading tracks...</span>
                </div>
              )}

              {detailError && !detailLoading && (
                <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-200">
                  {detailError}
                </div>
              )}

              {detail && !detailLoading && (
                <>
                  <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 p-6 rounded-2xl bg-[#121419] border border-white/[0.07]">
                    <ArtworkImage
                      src={detail.artwork}
                      alt={detail.title}
                      className={`w-36 h-36 sm:w-44 sm:h-44 shrink-0 shadow-xl ${
                        detail.type === 'artist' ? 'rounded-full' : 'rounded-xl'
                      }`}
                      iconSize={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
                        {detail.type === 'artist'
                          ? 'Singer Discography'
                          : detail.type === 'album'
                            ? 'Full Album'
                            : 'Curated Playlist'}
                      </p>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mt-1 text-balance">
                        {detail.title}
                      </h1>
                      {detail.subtitle && (
                        <p className="text-sm text-zinc-300 mt-1">{detail.subtitle}</p>
                      )}
                      {detail.meta && (
                        <p className="text-xs font-mono text-zinc-400 mt-1.5">
                          {detail.meta}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2.5 mt-5">
                        <button
                          type="button"
                          onClick={() => playCollectionNonstop(filteredDetailTracks, false)}
                          className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                        >
                          <Play size={15} className="fill-zinc-950" />
                          <span>Play All Non-Stop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => playCollectionNonstop(filteredDetailTracks, true)}
                          className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-zinc-100 font-medium text-xs inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                        >
                          <Shuffle size={15} />
                          <span>Shuffle</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Era / Sort Bar inside Detail */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ERA_OPTIONS.map((era) => (
                        <button
                          key={era.id}
                          type="button"
                          onClick={() => setEraFilter(era.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            eraFilter === era.id
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-[#14171C] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {era.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {availableDetailYears.length > 0 && (
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(e.target.value)}
                          aria-label="Filter by launch year"
                          className="h-9 px-3 rounded-lg bg-[#14171C] border border-white/[0.08] text-xs font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="all">All Years</option>
                          {availableDetailYears.map((yr) => (
                            <option key={yr} value={yr}>
                              {yr}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="flex items-center gap-1 p-1 rounded-lg bg-[#14171C]">
                        {(
                          [
                            { id: 'relevance', label: 'Default' },
                            { id: 'oldest', label: 'Oldest First' },
                            { id: 'newest', label: 'Newest First' },
                          ] as Array<{ id: SortOrder; label: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSortOrder(opt.id)}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              sortOrder === opt.id
                                ? 'bg-emerald-500 text-zinc-950 font-semibold'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {filteredDetailTracks.map((track, idx) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        index={idx}
                        isCurrent={currentTrack?.id === track.id}
                        isPlaying={isPlaying}
                        isFavorite={favoriteIds.has(track.id)}
                        onPlay={(t) => playTrack(t, filteredDetailTracks)}
                        onToggleFavorite={toggleFavorite}
                        onAddToQueue={addToQueue}
                        onOpenArtist={(id, name) => openCollection('artist', id, name)}
                        onOpenAlbum={(albumId) => openCollection('album', albumId)}
                        onWatchVideo={watchVideoForTrack}
                        onSwitchToAudio={switchToAudioForTrack}
                      />
                    ))}
                  </div>

                  {detail.albums && detail.albums.length > 0 && (
                    <div className="pt-4">
                      <h2 className="font-display text-xl font-semibold text-white mb-4">
                        Albums by {detail.title}
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {detail.albums.map((album) => (
                          <AlbumCard
                            key={album.id}
                            album={album}
                            onOpen={() => openCollection('album', album.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* FAVORITES VIEW */}
          {view === 'favorites' && (
            <section className="space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Saved Favorites
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1">
                    {favorites.length} {favorites.length === 1 ? 'track' : 'tracks'} saved on this device
                  </p>
                </div>
                {favorites.length > 0 && (
                  <button
                    type="button"
                    onClick={() => playCollectionNonstop(favorites)}
                    className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <Play size={14} className="fill-zinc-950" />
                    <span>Play All</span>
                  </button>
                )}
              </div>

              {favorites.length === 0 ? (
                <div className="p-10 rounded-2xl bg-[#121419] border border-white/[0.06] text-center space-y-3">
                  <Heart size={28} className="mx-auto text-zinc-600" />
                  <p className="text-sm text-zinc-300">No favorite tracks yet.</p>
                  <button
                    type="button"
                    onClick={() => setView('discover')}
                    className="px-4 py-2 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white"
                  >
                    Explore Music
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  {favorites.map((track, idx) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={idx}
                      isCurrent={currentTrack?.id === track.id}
                      isPlaying={isPlaying}
                      isFavorite={true}
                      onPlay={(t) => playTrack(t, favorites)}
                      onToggleFavorite={toggleFavorite}
                      onAddToQueue={addToQueue}
                      onOpenArtist={(id, name) => openCollection('artist', id, name)}
                      onOpenAlbum={(albumId) => openCollection('album', albumId)}
                      onWatchVideo={watchVideoForTrack}
                      onSwitchToAudio={switchToAudioForTrack}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* QUEUE VIEW */}
          {view === 'queue' && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Up Next Queue
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1">
                    Continuous playback order & automatic radio continuation
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoplayRadio((prev) => !prev)}
                    className={`h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors ${
                      autoplayRadio
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-[#14171C] text-zinc-400 border-white/[0.06]'
                    }`}
                  >
                    <Radio size={14} />
                    <span>Autoplay Radio: {autoplayRadio ? 'On' : 'Off'}</span>
                  </button>

                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueue([])}
                      className="h-9 px-3 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 inline-flex items-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {currentTrack && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2">Now Playing</p>
                  <TrackRow
                    track={currentTrack}
                    isCurrent={true}
                    isPlaying={isPlaying}
                    isFavorite={favoriteIds.has(currentTrack.id)}
                    onPlay={(t) => playTrack(t)}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">
                  Queued Tracks ({queue.length})
                </p>
                {queue.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#121419] border border-white/[0.06] text-center text-sm text-zinc-400">
                    Queue is empty. {autoplayRadio ? 'Similar songs will automatically play next when the current track finishes.' : 'Add tracks with the + button.'}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {queue.map((track, idx) => (
                      <TrackRow
                        key={`${track.id}-${idx}`}
                        track={track}
                        index={idx}
                        isCurrent={false}
                        isPlaying={false}
                        isFavorite={favoriteIds.has(track.id)}
                        onPlay={(t) => playTrack(t, queue.slice(idx))}
                        onToggleFavorite={toggleFavorite}
                        onRemoveFromQueue={removeFromQueue}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-32 md:bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-[#1C2028] text-xs font-medium text-zinc-100 border border-white/[0.1] shadow-lg whitespace-nowrap"
        >
          {toastMessage}
        </div>
      )}

      {/* Persistent Bottom Area (Respecting 15% mobile sticky cap: 56px mini-player + 48px nav = 104px) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:left-64 lg:left-68">
        <PlayerBar
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          shuffle={shuffle}
          repeat={repeat}
          quality={quality}
          isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
          queueCount={queue.length}
          onTogglePlay={togglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          onSeek={handleSeek}
          onVolumeChange={(v) => {
            setVolume(v);
            if (v > 0 && isMuted) setIsMuted(false);
          }}
          onToggleMute={() => setIsMuted((m) => !m)}
          onToggleShuffle={() => setShuffle((s) => !s)}
          onCycleRepeat={cycleRepeat}
          onToggleFavorite={() => currentTrack && toggleFavorite(currentTrack)}
          onCycleQuality={cycleQuality}
          onOpenQueue={() => setView('queue')}
          onOpenNowPlaying={() => setNowPlayingOpen(true)}
          onSwitchMedia={() => {
            if (!currentTrack) return;
            if (currentTrack.kind === 'audio') {
              watchVideoForTrack(currentTrack);
            } else {
              switchToAudioForTrack(currentTrack);
            }
          }}
        />

        {/* Mobile Bottom Tab Bar (48px height) */}
        <nav
          className="md:hidden grid grid-cols-5 h-12 bg-[#0E1014]/95 backdrop-blur-lg border-t border-white/[0.08]"
          aria-label="Mobile navigation"
        >
          {(
            [
              { id: 'discover', label: 'Home', icon: Compass },
              { id: 'search', label: 'Search', icon: Search },
              { id: 'videos', label: 'Videos', icon: Film },
              { id: 'favorites', label: 'Liked', icon: Heart },
              { id: 'queue', label: 'Queue', icon: ListMusic },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-emerald-400' : 'text-zinc-400'
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Expanded Now Playing & Video Theater Sheet */}
      <NowPlayingSheet
        open={nowPlayingOpen}
        track={currentTrack}
        videoRef={videoRef}
        videoUrl={currentVideoStreamUrl}
        isPlaying={isPlaying}
        isBuffering={isBuffering}
        currentTime={currentTime}
        duration={duration}
        shuffle={shuffle}
        repeat={repeat}
        quality={quality}
        volume={volume}
        isMuted={isMuted}
        isFavorite={currentTrack ? favoriteIds.has(currentTrack.id) : false}
        onClose={() => setNowPlayingOpen(false)}
        onTogglePlay={togglePlay}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={cycleRepeat}
        onSelectQuality={setQuality}
        onVolumeChange={(v) => {
          setVolume(v);
          if (v > 0 && isMuted) setIsMuted(false);
        }}
        onToggleMute={() => setIsMuted((m) => !m)}
        onToggleFavorite={() => currentTrack && toggleFavorite(currentTrack)}
        onOpenArtist={(id, name) => openCollection('artist', id, name)}
        onWatchVideo={watchVideoForTrack}
        onSwitchToAudio={switchToAudioForTrack}
        visualMode={cinemaVisualMode}
        onExitVisualMode={() => setCinemaVisualMode(false)}
        audioOnlyVideo={videoAudioOnlyMode}
        onShowVideoStage={() => setVideoAudioOnlyMode(false)}
        videoMuted={!videoStandalone}
        playbackRate={playbackRate}
        onPlaybackRateChange={handlePlaybackRateChange}
        ytControlRef={ytControlRef}
        onYtTimeUpdate={(cur, dur) => {
          setCurrentTime(cur);
          if (dur > 0) setDuration(dur);
        }}
        playlist={queue}
        autoplayNext={videoAutoplayNext}
        onToggleAutoplay={() => setVideoAutoplayNext((a) => !a)}
        onSelectPlaylistTrack={(item) => {
          const remaining = queue.filter((q) => q.id !== item.id);
          setQueue(remaining);
          playTrack(item);
        }}
        onRemovePlaylistTrack={(idx) => removeFromQueue(idx)}
        onVideoTimeUpdate={() => {
          if (videoStandaloneRef.current && videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onVideoLoadedMetadata={() => {
          const vid = videoRef.current;
          if (!vid) return;
          if (!videoStandaloneRef.current && audioRef.current) {
            vid.muted = true;
            vid.playbackRate = audioRef.current.playbackRate || 1;
            if (Math.abs(vid.currentTime - audioRef.current.currentTime) > 0.25) {
              vid.currentTime = audioRef.current.currentTime;
            }
            if (!audioRef.current.paused && vid.paused && !document.hidden) {
              vid.play().catch(() => {});
            }
          } else {
            if (Number.isFinite(vid.duration)) setDuration(vid.duration);
            setIsBuffering(false);
          }
        }}
        onVideoCanPlay={() => {
          const vid = videoRef.current;
          if (!vid) return;
          if (!videoStandaloneRef.current && audioRef.current) {
            vid.muted = true;
            vid.playbackRate = audioRef.current.playbackRate || 1;
            if (Math.abs(vid.currentTime - audioRef.current.currentTime) > 0.25) {
              vid.currentTime = audioRef.current.currentTime;
            }
            if (!audioRef.current.paused && vid.paused && !document.hidden) {
              vid.play().catch(() => {});
            }
          } else {
            setIsBuffering(false);
          }
        }}
        onVideoEnded={() => {
          if (videoStandaloneRef.current) {
            handleNextRef.current();
          }
        }}
        onVideoPlayState={(playing) => {
          if (videoStandaloneRef.current) {
            setIsPlaying(playing);
            if (playing) setIsBuffering(false);
            return;
          }
          // Ignore browser power-saving pause of <video> when screen turns off / tab hides;
          // <audio> continues playing uninterrupted in the background.
          if (document.hidden || !audioRef.current || !videoRef.current) return;
          if (playing && audioRef.current.paused) {
            audioRef.current.play().catch(() => {});
          } else if (
            !playing &&
            document.pictureInPictureElement === videoRef.current &&
            !audioRef.current.paused &&
            videoRef.current.readyState >= 3
          ) {
            audioRef.current.pause();
          }
        }}
        onVideoWaiting={(waiting) => {
          if (videoStandaloneRef.current) setIsBuffering(waiting);
        }}
      />
    </div>
  );
}

function VideoCard({
  video,
  isCurrent,
  onPlay,
  onSwitchToAudio,
}: {
  video: Track;
  isCurrent: boolean;
  onPlay: (v: Track) => void;
  onSwitchToAudio: (v: Track) => void;
}) {
  return (
    <div
      className={`group rounded-xl overflow-hidden bg-[#121419] border transition-colors flex flex-col ${
        isCurrent
          ? 'border-emerald-500/50 bg-[#171B21]'
          : 'border-white/[0.06] hover:bg-[#181B22]'
      }`}
    >
      <button
        type="button"
        onClick={() => onPlay(video)}
        className="text-left focus-visible:outline-none"
      >
        <div className="relative aspect-video bg-black overflow-hidden">
          <ArtworkImage
            src={video.artwork.large || video.artwork.medium}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
            iconSize={28}
          />
          <span className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <span className="w-11 h-11 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center shadow-lg">
              <Play size={18} className="fill-zinc-950 ml-0.5" />
            </span>
          </span>
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 text-[11px] font-mono tabular-nums text-zinc-200">
            {formatDuration(video.duration)}
          </span>
        </div>

        <div className="p-3.5 pb-2">
          <p
            className={`text-sm font-medium truncate ${
              isCurrent ? 'text-emerald-400' : 'text-zinc-100'
            }`}
          >
            {video.title}
          </p>
          <p className="text-xs text-zinc-400 truncate mt-1">{video.artist}</p>
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
            Album: {video.album} · Launched {video.releaseDate || video.year || 'Unknown'}
          </p>
        </div>
      </button>

      <div className="px-3.5 pb-3.5 pt-1 mt-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSwitchToAudio(video)}
          className="flex-1 h-8 px-2.5 rounded-lg text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <Music size={12} />
          <span>Switch to Audio</span>
        </button>
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  onOpen,
}: {
  album: AlbumSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
    >
      <div className="aspect-square rounded-lg overflow-hidden mb-3 relative">
        <ArtworkImage
          src={album.artwork.large || album.artwork.medium}
          alt={album.title}
          className="w-full h-full group-hover:scale-[1.03] transition-transform"
        />
        <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Disc3 size={15} />
        </span>
      </div>
      <p className="text-sm font-medium text-zinc-100 truncate">{album.title}</p>
      <p className="text-xs text-zinc-400 truncate mt-0.5">
        {album.artist}
        {album.year ? ` · ${album.year}` : ''}
      </p>
    </button>
  );
}

function PlaylistCard({
  playlist,
  onOpen,
}: {
  playlist: PlaylistSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors"
    >
      <div className="aspect-square rounded-lg overflow-hidden mb-3">
        <ArtworkImage
          src={playlist.artwork.large || playlist.artwork.medium}
          alt={playlist.title}
          className="w-full h-full group-hover:scale-[1.03] transition-transform"
        />
      </div>
      <p className="text-sm font-medium text-zinc-100 truncate">{playlist.title}</p>
      <p className="text-xs text-zinc-400 truncate mt-0.5">
        {playlist.language || 'Playlist'}
        {playlist.songCount ? ` · ${playlist.songCount} songs` : ''}
      </p>
    </button>
  );
}

function ArtistCard({
  artist,
  onOpen,
}: {
  artist: ArtistSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 p-3 rounded-xl bg-[#121419] hover:bg-[#181B22] border border-white/[0.06] transition-colors text-left"
    >
      <ArtworkImage
        src={artist.artwork.medium || artist.artwork.small}
        alt={artist.name}
        className="w-12 h-12 rounded-full shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 truncate">{artist.name}</p>
        <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
          <Mic2 size={11} />
          <span>Singer</span>
        </p>
      </div>
    </button>
  );
}
