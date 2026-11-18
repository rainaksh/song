import { Film, Heart, ListPlus, Mic2, Music, Pause, Play, Video, X } from 'lucide-react';
import type { Track } from '../types/music';
import { formatDuration } from '../utils/format';
import { ArtworkImage } from './ArtworkImage';

interface TrackRowProps {
  track: Track;
  index?: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: (track: Track) => void;
  onToggleFavorite: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onRemoveFromQueue?: (index: number) => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onOpenAlbum?: (albumId: string) => void;
  onWatchVideo?: (track: Track) => void;
  onSwitchToAudio?: (track: Track) => void;
}

export function TrackRow({
  track,
  index,
  isCurrent,
  isPlaying,
  isFavorite,
  onPlay,
  onToggleFavorite,
  onAddToQueue,
  onRemoveFromQueue,
  onOpenArtist,
  onOpenAlbum,
  onWatchVideo,
  onSwitchToAudio,
}: TrackRowProps) {
  const launchInfo =
    track.releaseDate && track.releaseDate !== 'Unknown'
      ? track.releaseDate
      : track.year || 'Unknown';

  const artistQueryId = track.primaryArtistId || '';
  const artistQueryName =
    track.primaryArtistName || track.artist.split(',')[0].trim();

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-150 border ${
        isCurrent
          ? 'bg-[#171B21] border-emerald-500/30'
          : 'bg-transparent border-transparent hover:bg-[#14161B] hover:border-white/[0.06]'
      }`}
    >
      {typeof index === 'number' && (
        <span
          className={`hidden sm:inline-flex w-6 justify-end text-xs font-mono tabular-nums shrink-0 ${
            isCurrent ? 'text-emerald-400 font-medium' : 'text-zinc-500'
          }`}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
      )}

      <button
        type="button"
        onClick={() => onPlay(track)}
        className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
      >
        <ArtworkImage
          src={track.artwork.medium || track.artwork.small}
          alt={`${track.title} cover art`}
          className="w-12 h-12 rounded-lg"
        />
        <span
          className={`absolute inset-0 flex items-center justify-center bg-black/55 transition-opacity duration-150 ${
            isCurrent
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          {isCurrent && isPlaying ? (
            <Pause size={18} className="text-emerald-400 fill-emerald-400" />
          ) : (
            <Play size={18} className="text-white fill-white ml-0.5" />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1 py-0.5">
        <button
          type="button"
          onClick={() => onPlay(track)}
          className="flex items-center gap-2 min-w-0 max-w-full text-left focus-visible:outline-none"
        >
          <p
            className={`text-sm font-medium truncate ${
              isCurrent ? 'text-emerald-400' : 'text-zinc-100'
            }`}
          >
            {track.title}
          </p>
          {track.kind === 'video' && (
            <Film size={13} className="text-emerald-400 shrink-0" aria-label="Video" />
          )}
        </button>

        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {onOpenArtist && (artistQueryId || artistQueryName) ? (
            <button
              type="button"
              onClick={() => onOpenArtist(artistQueryId, artistQueryName)}
              className="hover:text-emerald-400 hover:underline transition-colors text-left"
              title={`More songs by ${artistQueryName}`}
            >
              {track.artist}
            </button>
          ) : (
            <span>{track.artist}</span>
          )}
          {track.album && (
            <>
              <span className="mx-1.5 text-zinc-600" aria-hidden="true">
                ·
              </span>
              {onOpenAlbum && track.albumId ? (
                <button
                  type="button"
                  onClick={() => onOpenAlbum(track.albumId!)}
                  className="text-zinc-300 hover:text-emerald-400 hover:underline transition-colors text-left"
                  title={`Open album: ${track.album}`}
                >
                  Album: {track.album}
                </button>
              ) : (
                <span className="text-zinc-300">Album: {track.album}</span>
              )}
            </>
          )}
          <span className="mx-1.5 text-zinc-600" aria-hidden="true">
            ·
          </span>
          <span className="text-zinc-400 font-mono tabular-nums">
            {launchInfo}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="hidden sm:inline-block text-xs font-mono tabular-nums text-zinc-500 mr-1.5">
          {formatDuration(track.duration)}
        </span>

        {onWatchVideo && track.kind === 'audio' && (
          <button
            type="button"
            onClick={() => onWatchVideo(track)}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 h-8 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-emerald-300 bg-white/[0.04] hover:bg-emerald-500/10 border border-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title={`Switch to Video for ${track.title}`}
            aria-label={`Switch to Video for ${track.title}`}
          >
            <Video size={13} />
            <span className="hidden md:inline">Switch to Video</span>
          </button>
        )}

        {onSwitchToAudio && track.kind === 'video' && (
          <button
            type="button"
            onClick={() => onSwitchToAudio(track)}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 h-8 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-emerald-300 bg-white/[0.04] hover:bg-emerald-500/10 border border-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title={`Switch to Audio for ${track.title}`}
            aria-label={`Switch to Audio for ${track.title}`}
          >
            <Music size={13} />
            <span className="hidden md:inline">Switch to Audio</span>
          </button>
        )}

        {onOpenArtist && (artistQueryId || artistQueryName) && track.kind === 'audio' && (
          <button
            type="button"
            onClick={() => onOpenArtist(artistQueryId, artistQueryName)}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 h-8 rounded-lg text-[11px] font-medium text-zinc-300 hover:text-emerald-300 bg-white/[0.04] hover:bg-emerald-500/10 border border-white/[0.06] transition-colors whitespace-nowrap shrink-0"
            title={`More songs by ${artistQueryName}`}
          >
            <Mic2 size={12} />
            <span>More by artist</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggleFavorite(track)}
          className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            isFavorite
              ? 'text-emerald-400 hover:bg-white/[0.06]'
              : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]'
          }`}
          aria-label={isFavorite ? `Remove ${track.title} from favorites` : `Save ${track.title} to favorites`}
        >
          <Heart size={17} className={isFavorite ? 'fill-emerald-400' : ''} />
        </button>

        {onAddToQueue && (
          <button
            type="button"
            onClick={() => onAddToQueue(track)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label={`Add ${track.title} to queue`}
            title="Add to queue"
          >
            <ListPlus size={18} />
          </button>
        )}

        {onRemoveFromQueue && typeof index === 'number' && (
          <button
            type="button"
            onClick={() => onRemoveFromQueue(index)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label={`Remove ${track.title} from queue`}
            title="Remove from queue"
          >
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
