import { useRef, type RefObject } from 'react';
import {
  ChevronDown,
  Heart,
  Loader2,
  Maximize2,
  Mic2,
  Music,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AudioQuality, RepeatMode, Track } from '../types/music';
import { formatDuration } from '../utils/format';
import { ArtworkImage } from './ArtworkImage';

interface NowPlayingSheetProps {
  open: boolean;
  track: Track | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  videoUrl: string;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  quality: AudioQuality;
  volume: number;
  isMuted: boolean;
  isFavorite: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSelectQuality: (q: AudioQuality) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onToggleFavorite: () => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onWatchVideo?: (track: Track) => void;
  onSwitchToAudio?: (track: Track) => void;
  visualMode?: boolean;
  onExitVisualMode?: () => void;
  videoMuted?: boolean;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  onVideoTimeUpdate: () => void;
  onVideoLoadedMetadata: () => void;
  onVideoCanPlay?: () => void;
  onVideoEnded: () => void;
  onVideoPlayState: (playing: boolean) => void;
  onVideoWaiting: (waiting: boolean) => void;
}

const QUALITIES: AudioQuality[] = ['320kbps', '160kbps', '96kbps'];

export function NowPlayingSheet({
  open,
  track,
  videoRef,
  videoUrl,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  shuffle,
  repeat,
  quality,
  volume,
  isMuted,
  isFavorite,
  onClose,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onSelectQuality,
  onVolumeChange,
  onToggleMute,
  onToggleFavorite,
  onOpenArtist,
  onWatchVideo,
  onSwitchToAudio,
  visualMode = false,
  onExitVisualMode,
  videoMuted = false,
  playbackRate = 1,
  onPlaybackRateChange,
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
  onVideoCanPlay,
  onVideoEnded,
  onVideoPlayState,
  onVideoWaiting,
}: NowPlayingSheetProps) {
  const cinemaStageRef = useRef<HTMLDivElement | null>(null);

  if (!track) return null;

  const isVideo = track.kind === 'video';
  const showCinemaVisual = !isVideo && visualMode;
  const effectiveDuration = duration || track.duration || 0;
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  const launchDisplay =
    track.releaseDate && track.releaseDate !== 'Unknown'
      ? track.releaseDate
      : track.year || 'Unknown';

  const handleFullscreen = () => {
    const el = isVideo ? videoRef.current : cinemaStageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  };

  const handlePiP = () => {
    const el = videoRef.current;
    if (!el || !document.pictureInPictureEnabled) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      el.requestPictureInPicture().catch(() => {});
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0B0C0E] flex flex-col overflow-y-auto transition-opacity duration-200 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal={open}
      aria-hidden={!open}
      aria-label={`Now playing: ${track.title}`}
    >
      {/* Atmospheric cover backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {track.artwork.large && (
          <img
            src={track.artwork.large}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-20 blur-3xl scale-110"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0C0E]/75 via-[#0B0C0E]/88 to-[#0B0C0E]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 max-w-4xl w-full mx-auto">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors"
          aria-label="Minimize player"
        >
          <ChevronDown size={24} />
        </button>

        <span className="text-xs font-medium text-zinc-400 tracking-wide">
          {isVideo
            ? 'Video Stage · Screen-Off Background Ready'
            : showCinemaVisual
              ? 'Cinema Visual Stage · Background Ready'
              : 'Audio Stage · Ad-Free'}
        </span>

        <button
          type="button"
          onClick={onToggleFavorite}
          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
            isFavorite
              ? 'text-emerald-400 hover:bg-white/[0.08]'
              : 'text-zinc-400 hover:text-white hover:bg-white/[0.08]'
          }`}
          aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
        >
          <Heart size={20} className={isFavorite ? 'fill-emerald-400' : ''} />
        </button>
      </header>

      {/* Main focal media */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pb-10 pt-2 max-w-2xl w-full mx-auto">
        {isVideo ? (
          <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/[0.1] shadow-2xl relative">
            <video
              ref={videoRef}
              poster={track.artwork.large || track.artwork.medium || undefined}
              muted={videoMuted}
              playsInline
              preload="auto"
              onClick={onTogglePlay}
              onTimeUpdate={onVideoTimeUpdate}
              onLoadedMetadata={onVideoLoadedMetadata}
              onCanPlay={onVideoCanPlay}
              onEnded={onVideoEnded}
              onPlay={() => onVideoPlayState(true)}
              onPause={() => onVideoPlayState(false)}
              onWaiting={() => onVideoWaiting(true)}
              className="w-full h-full object-contain bg-black cursor-pointer"
            />
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
                <button
                  type="button"
                  onClick={handlePiP}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-black/65 text-zinc-200 hover:text-white hover:bg-black/80 transition-colors"
                  aria-label="Picture in Picture"
                  title="Picture in Picture"
                >
                  <PictureInPicture2 size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={handleFullscreen}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-black/65 text-zinc-200 hover:text-white hover:bg-black/80 transition-colors"
                aria-label="Fullscreen video"
                title="Fullscreen"
              >
                <Maximize2 size={16} />
              </button>
            </div>
          </div>
        ) : showCinemaVisual ? (
          <div className="w-full">
            <div
              ref={cinemaStageRef}
              onClick={onTogglePlay}
              className="w-full aspect-video rounded-2xl overflow-hidden bg-[#07080A] border border-white/[0.1] shadow-2xl relative cursor-pointer select-none"
            >
              {track.artwork.large && (
                <img
                  src={track.artwork.large}
                  alt=""
                  referrerPolicy="no-referrer"
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${
                    isPlaying ? 'scale-110 opacity-40' : 'scale-105 opacity-25'
                  } blur-2xl`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/60" />

              <div className="relative z-10 h-full flex flex-col items-center justify-center p-5 text-center">
                <div
                  className={`w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden shadow-2xl border border-white/[0.14] transition-transform duration-500 ${
                    isPlaying ? 'scale-100' : 'scale-95 opacity-90'
                  }`}
                >
                  <ArtworkImage
                    src={track.artwork.large || track.artwork.medium}
                    alt={track.title}
                    className="w-full h-full"
                    iconSize={36}
                  />
                </div>

                {/* Equalizer bars synced to playback */}
                <div
                  className="mt-4 flex items-end justify-center gap-1.5 h-8"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((bar) => (
                    <span
                      key={bar}
                      className={`w-1.5 rounded-full bg-emerald-400/90 ${
                        isPlaying ? 'swara-eq-bar h-full' : 'h-2 opacity-40'
                      }`}
                      style={
                        isPlaying
                          ? {
                              animationDelay: `${(bar % 5) * 0.14}s`,
                              animationDuration: `${0.75 + (bar % 4) * 0.18}s`,
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFullscreen();
                }}
                className="absolute top-3 right-3 z-20 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-black/65 text-zinc-200 hover:text-white hover:bg-black/80 transition-colors"
                aria-label="Fullscreen cinema stage"
                title="Fullscreen"
              >
                <Maximize2 size={16} />
              </button>
            </div>
            <p className="text-center text-xs text-zinc-400 mt-2.5">
              Official music video is not in catalog · Playing synced Cinema Visual for your exact song
            </p>
          </div>
        ) : (
          <div className="w-full max-w-[330px] aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
            <ArtworkImage
              src={track.artwork.large || track.artwork.medium}
              alt={`${track.title} album artwork`}
              className="w-full h-full"
              iconSize={48}
            />
          </div>
        )}

        <div className="w-full max-w-lg mt-6 text-center">
          <h2 className="text-2xl font-display font-semibold text-white tracking-tight text-balance">
            {track.title}
          </h2>
          <p className="text-sm text-zinc-300 mt-1.5 truncate">{track.artist}</p>
          <p className="text-xs text-zinc-400 mt-1.5 truncate">
            <span>Album: {track.album}</span>
            <span className="mx-1.5 text-zinc-600" aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums">Launched {launchDisplay}</span>
            {track.language && (
              <>
                <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                  ·
                </span>
                <span>{track.language}</span>
              </>
            )}
          </p>
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            {onWatchVideo && track.kind === 'audio' && !showCinemaVisual && (
              <button
                type="button"
                onClick={() => onWatchVideo(track)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-colors"
              >
                <Video size={13} />
                <span>Switch to Video</span>
              </button>
            )}

            {showCinemaVisual && onExitVisualMode && (
              <button
                type="button"
                onClick={onExitVisualMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-colors"
              >
                <Music size={13} />
                <span>Switch to Cover View</span>
              </button>
            )}

            {onSwitchToAudio && track.kind === 'video' && (
              <button
                type="button"
                onClick={() => onSwitchToAudio(track)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-colors"
              >
                <Music size={13} />
                <span>Switch to Audio</span>
              </button>
            )}

            {onOpenArtist && track.kind === 'audio' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenArtist(
                    track.primaryArtistId || '',
                    track.primaryArtistName || track.artist.split(',')[0].trim()
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] transition-colors"
              >
                <Mic2 size={13} />
                <span>More songs by this artist</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrubber */}
        <div className="w-full max-w-lg mt-6">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            step={0.5}
            value={Math.min(currentTime, effectiveDuration || 100)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Seek position"
            className="audio-range w-full h-5"
            style={{
              backgroundImage: `linear-gradient(to right, #34d399 ${progressPercent}%, rgba(255,255,255,0.16) ${progressPercent}%)`,
              backgroundSize: '100% 4px',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
          <div className="flex items-center justify-between text-xs font-mono tabular-nums text-zinc-400 mt-1">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(effectiveDuration)}</span>
          </div>
        </div>

        {/* Transport buttons */}
        <div className="w-full max-w-lg flex items-center justify-between mt-4 px-2">
          <button
            type="button"
            onClick={onToggleShuffle}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              shuffle ? 'text-emerald-400 bg-emerald-500/15' : 'text-zinc-400 hover:text-white'
            }`}
            aria-label="Toggle shuffle"
            aria-pressed={shuffle}
          >
            <Shuffle size={20} />
          </button>

          <button
            type="button"
            onClick={onPrev}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white transition-colors"
            aria-label="Previous track"
          >
            <SkipBack size={26} className="fill-current" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors active:scale-95 shadow-lg"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? (
              <Loader2 size={26} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={26} className="fill-zinc-950" />
            ) : (
              <Play size={26} className="fill-zinc-950 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-200 hover:text-white transition-colors"
            aria-label="Next track"
          >
            <SkipForward size={26} className="fill-current" />
          </button>

          <button
            type="button"
            onClick={onCycleRepeat}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              repeat !== 'off'
                ? 'text-emerald-400 bg-emerald-500/15'
                : 'text-zinc-400 hover:text-white'
            }`}
            aria-label={`Repeat mode: ${repeat}`}
          >
            {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        {/* Quality & Volume row */}
        <div className="w-full max-w-lg mt-7 pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
          {!isVideo ? (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.05]">
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSelectQuality(q)}
                  className={`px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    quality === q
                      ? 'bg-emerald-500 text-zinc-950 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {q.replace('kbps', 'k')}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.05]">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => {
                    if (onPlaybackRateChange) {
                      onPlaybackRateChange(rate);
                    } else if (videoRef.current) {
                      videoRef.current.playbackRate = rate;
                    }
                  }}
                  className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors ${
                    playbackRate === rate
                      ? 'bg-emerald-500 text-zinc-950 font-medium'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={`Playback speed ${rate}x`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume"
              className="audio-range w-24 h-4"
              style={{
                backgroundImage: `linear-gradient(to right, #e4e4e7 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.16) ${(isMuted ? 0 : volume) * 100}%)`,
                backgroundSize: '100% 4px',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
