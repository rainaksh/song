import {
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
  Music,
  Pause,
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

interface PlayerBarProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  quality: AudioQuality;
  isFavorite: boolean;
  queueCount: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleFavorite: () => void;
  onCycleQuality: () => void;
  onOpenQueue: () => void;
  onOpenNowPlaying: () => void;
  onSwitchMedia?: () => void;
}

export function PlayerBar({
  currentTrack,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  volume,
  isMuted,
  shuffle,
  repeat,
  quality,
  isFavorite,
  queueCount,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleShuffle,
  onCycleRepeat,
  onToggleFavorite,
  onCycleQuality,
  onOpenQueue,
  onOpenNowPlaying,
  onSwitchMedia,
}: PlayerBarProps) {
  if (!currentTrack) return null;

  const effectiveDuration = duration || currentTrack.duration || 0;
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div className="bg-[#111317]/95 backdrop-blur-xl border-t border-white/[0.08]">
      {/* Mobile subtle top progress bar */}
      <div className="md:hidden h-0.5 w-full bg-white/[0.08]">
        <div
          className="h-full bg-emerald-400 transition-[width] duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Mobile Compact Mini Player (56px height) */}
      <div className="flex md:hidden items-center justify-between gap-2 px-3 h-14">
        <button
          type="button"
          onClick={onOpenNowPlaying}
          className="flex items-center gap-3 min-w-0 flex-1 text-left py-1 focus-visible:outline-none"
        >
          <ArtworkImage
            src={currentTrack.artwork.small || currentTrack.artwork.medium}
            alt={currentTrack.title}
            className="w-10 h-10 rounded-lg shrink-0"
            iconSize={16}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100 truncate">
              {currentTrack.title}
            </p>
            <p className="text-xs text-zinc-400 truncate">{currentTrack.artist}</p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleFavorite}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg ${
              isFavorite ? 'text-emerald-400' : 'text-zinc-400'
            }`}
            aria-label="Toggle favorite"
          >
            <Heart size={18} className={isFavorite ? 'fill-emerald-400' : ''} />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-emerald-500 text-zinc-950 active:scale-95 transition-transform"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isBuffering ? (
              <Loader2 size={18} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={18} className="fill-zinc-950" />
            ) : (
              <Play size={18} className="fill-zinc-950 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-300"
            aria-label="Next track"
          >
            <SkipForward size={18} />
          </button>
        </div>
      </div>

      {/* Desktop Full 3-Zone Player Bar (80px height) */}
      <div className="hidden md:grid grid-cols-[minmax(220px,1fr)_minmax(340px,1.4fr)_minmax(220px,1fr)] items-center gap-6 px-6 h-20 max-w-[1600px] mx-auto">
        {/* Zone 1: Track Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            onClick={onOpenNowPlaying}
            className="group relative w-13 h-13 rounded-lg overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Expand now playing view"
          >
            <ArtworkImage
              src={currentTrack.artwork.medium || currentTrack.artwork.small}
              alt={currentTrack.title}
              className="w-13 h-13 rounded-lg"
            />
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ChevronUp size={18} className="text-white" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpenNowPlaying}
              className="text-sm font-medium text-zinc-100 hover:text-emerald-400 transition-colors truncate block max-w-full text-left"
            >
              {currentTrack.title}
            </button>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{currentTrack.artist}</p>
          </div>

          <button
            type="button"
            onClick={onToggleFavorite}
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
              isFavorite
                ? 'text-emerald-400 hover:bg-white/[0.06]'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Heart size={17} className={isFavorite ? 'fill-emerald-400' : ''} />
          </button>
        </div>

        {/* Zone 2: Transport + Scrubber */}
        <div className="flex flex-col items-center gap-1.5 w-full max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleShuffle}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors ${
                shuffle
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              aria-label="Toggle shuffle"
              aria-pressed={shuffle}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>

            <button
              type="button"
              onClick={onPrev}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white transition-colors"
              aria-label="Previous track"
              title="Previous"
            >
              <SkipBack size={19} className="fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors active:scale-95 shadow-sm"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isBuffering ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isPlaying ? (
                <Pause size={18} className="fill-zinc-950" />
              ) : (
                <Play size={18} className="fill-zinc-950 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white transition-colors"
              aria-label="Next track"
              title="Next"
            >
              <SkipForward size={19} className="fill-current" />
            </button>

            <button
              type="button"
              onClick={onCycleRepeat}
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg transition-colors ${
                repeat !== 'off'
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              aria-label={`Repeat mode: ${repeat}`}
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full">
            <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10 text-right shrink-0">
              {formatDuration(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              step={0.5}
              value={Math.min(currentTime, effectiveDuration || 100)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Seek audio position"
              className="audio-range flex-1 h-4"
              style={{
                backgroundImage: `linear-gradient(to right, #34d399 ${progressPercent}%, rgba(255,255,255,0.14) ${progressPercent}%)`,
                backgroundSize: '100% 4px',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
              }}
            />
            <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-10 shrink-0">
              {formatDuration(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Zone 3: Switch Mode, Quality, Queue, Volume */}
        <div className="flex items-center justify-end gap-1.5">
          {onSwitchMedia && (
            <button
              type="button"
              onClick={onSwitchMedia}
              className="px-2.5 h-8 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-colors whitespace-nowrap shrink-0"
              title={currentTrack.kind === 'audio' ? 'Switch to Video' : 'Switch to Audio'}
            >
              {currentTrack.kind === 'audio' ? <Video size={14} /> : <Music size={14} />}
              <span className="hidden xl:inline">
                {currentTrack.kind === 'audio' ? 'Switch to Video' : 'Switch to Audio'}
              </span>
            </button>
          )}

          {currentTrack.kind === 'audio' && (
            <button
              type="button"
              onClick={onCycleQuality}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums text-zinc-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.09] transition-colors whitespace-nowrap shrink-0"
              title="Switch streaming bitrate"
            >
              {quality.replace('kbps', 'k')}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenQueue}
            className="min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            aria-label="Open queue"
            title="Up Next Queue"
          >
            <ListMusic size={17} />
            <span className="font-mono tabular-nums">{queueCount}</span>
          </button>

          <div className="flex items-center gap-1.5 ml-1">
            <button
              type="button"
              onClick={onToggleMute}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-white transition-colors"
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
              className="audio-range w-20 h-4"
              style={{
                backgroundImage: `linear-gradient(to right, #e4e4e7 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.14) ${(isMuted ? 0 : volume) * 100}%)`,
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
