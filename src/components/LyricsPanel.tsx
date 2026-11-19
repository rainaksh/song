import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Music2, RefreshCw } from 'lucide-react';
import type { LyricsResponse, Track } from '../types/music';
import { formatDuration } from '../utils/format';
import { fetchLyricsData } from '../utils/musicClient';

interface LyricsPanelProps {
  track: Track;
  currentTime: number;
  onSeek: (time: number) => void;
  className?: string;
}

export function LyricsPanel({
  track,
  currentTime,
  onSeek,
  className = '',
}: LyricsPanelProps) {
  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | HTMLParagraphElement | null>>([]);
  const programmaticScrollAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setAutoFollow(true);
    lineRefs.current = [];

    fetchLyricsData(track)
      .then((data) => {
        if (!cancelled) {
          setLyrics(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [track.id, reloadNonce, track]);

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced || lyrics.lines.length === 0) return -1;
    const t = currentTime + 0.18;
    let active = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      const lineTime = lyrics.lines[i].time;
      if (lineTime !== null && lineTime <= t) {
        active = i;
      } else if (lineTime !== null && lineTime > t) {
        break;
      }
    }
    return active;
  }, [lyrics, currentTime]);

  const scrollToIndex = useCallback((idx: number, instant = false) => {
    const container = scrollContainerRef.current;
    const el = lineRefs.current[idx];
    if (!container || !el) return;

    const targetTop =
      el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    const clampedTop = Math.max(0, targetTop);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    programmaticScrollAtRef.current = Date.now();
    container.scrollTo({
      top: clampedTop,
      behavior: instant || prefersReduced ? 'auto' : 'smooth',
    });
  }, []);

  useEffect(() => {
    if (!autoFollow || activeIndex < 0) return;
    scrollToIndex(activeIndex);
  }, [activeIndex, autoFollow, scrollToIndex]);

  const handleUserScroll = () => {
    // Ignore scroll events triggered by programmatic centering
    if (Date.now() - programmaticScrollAtRef.current < 650) return;
    if (lyrics?.synced && autoFollow) {
      setAutoFollow(false);
    }
  };

  const handleJumpToActive = () => {
    setAutoFollow(true);
    if (activeIndex >= 0) {
      scrollToIndex(activeIndex);
    }
  };

  const statusLine = loading
    ? 'Searching synced lyrics'
    : lyrics?.instrumental
      ? `Instrumental track · ${lyrics.source || 'Catalog'}`
      : lyrics?.lines.length
        ? `${lyrics.synced ? 'Time-synced lyrics' : 'Plain lyrics'}${
            lyrics.source ? ` · ${lyrics.source}` : ''
          }`
        : 'Lyrics unavailable for this track';

  return (
    <section
      className={`w-full min-h-0 rounded-2xl bg-[#121419]/95 border border-white/[0.08] overflow-hidden flex flex-col ${className}`}
      aria-label="Track lyrics"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-[#161920] shrink-0">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-white truncate">
            Lyrics
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{statusLine}</p>
        </div>

        {lyrics?.synced && !autoFollow && (
          <button
            type="button"
            onClick={handleJumpToActive}
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/20 border border-emerald-500/25 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <LocateFixed size={13} />
            <span>Re-sync</span>
          </button>
        )}
      </div>

      {/* Scrollable Body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleUserScroll}
        onWheel={() => {
          if (lyrics?.synced && autoFollow) setAutoFollow(false);
        }}
        onTouchMove={() => {
          if (lyrics?.synced && autoFollow) setAutoFollow(false);
        }}
        className="relative flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-1.5"
      >
        {loading && (
          <div className="space-y-3 py-4" aria-busy="true" aria-label="Loading lyrics">
            {[72, 58, 84, 65, 78, 50, 68, 60].map((w, idx) => (
              <div
                key={idx}
                className="h-5 rounded-md bg-white/[0.06] animate-pulse"
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4">
            <Music2 size={26} className="text-zinc-500 mb-2.5" />
            <p className="text-sm font-medium text-zinc-200">Could not load lyrics</p>
            <p className="text-xs text-zinc-400 mt-1">
              Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="mt-4 min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {!loading && !error && lyrics?.instrumental && (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4">
            <Music2 size={28} className="text-emerald-400/80 mb-2.5" />
            <p className="text-sm font-medium text-zinc-100">Instrumental Track</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              This recording has no vocal lyrics. Enjoy the pure soundtrack.
            </p>
          </div>
        )}

        {!loading && !error && !lyrics?.instrumental && (!lyrics || lyrics.lines.length === 0) && (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4">
            <Music2 size={26} className="text-zinc-500 mb-2.5" />
            <p className="text-sm font-medium text-zinc-200">No lyrics found yet</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-xs">
              Synced lyrics are not available in the catalog for &ldquo;{track.title}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="mt-4 min-h-[40px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-zinc-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={13} />
              <span>Search Again</span>
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          lyrics &&
          lyrics.lines.length > 0 &&
          lyrics.lines.map((line, idx) => {
            const isSyncedLine = lyrics.synced && line.time !== null;
            const isActive = idx === activeIndex;
            const isPast = activeIndex >= 0 && idx < activeIndex;

            if (isSyncedLine && line.time !== null) {
              const targetTime = line.time;
              return (
                <button
                  key={`${idx}-${targetTime}`}
                  ref={(el) => {
                    lineRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => {
                    onSeek(targetTime);
                    setAutoFollow(true);
                  }}
                  aria-current={isActive ? 'true' : undefined}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-left flex items-baseline gap-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : isPast
                        ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]'
                        : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className={`text-[11px] font-mono tabular-nums shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {formatDuration(targetTime)}
                  </span>
                  <span
                    className={`leading-relaxed transition-colors ${
                      isActive
                        ? 'text-base sm:text-lg font-semibold text-white'
                        : 'text-sm sm:text-[15px] font-medium'
                    }`}
                  >
                    {line.text}
                  </span>
                </button>
              );
            }

            return (
              <p
                key={idx}
                ref={(el) => {
                  lineRefs.current[idx] = el;
                }}
                className="px-2 py-1.5 text-sm sm:text-[15px] leading-relaxed text-zinc-200"
              >
                {line.text}
              </p>
            );
          })}
      </div>
    </section>
  );
}
