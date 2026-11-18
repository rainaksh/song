import type { AudioQuality, Track } from '../types/music';

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function selectStreamUrl(track: Track | null, preferred: AudioQuality): string {
  if (!track || track.streams.length === 0) return '';

  const priorityOrder: Record<AudioQuality, string[]> = {
    '320kbps': ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'],
    '160kbps': ['160kbps', '320kbps', '96kbps', '48kbps', '12kbps'],
    '96kbps': ['96kbps', '160kbps', '48kbps', '320kbps', '12kbps'],
  };

  for (const quality of priorityOrder[preferred]) {
    const match = track.streams.find((item) => item.quality === quality);
    if (match?.url) return match.url;
  }

  return track.streams[track.streams.length - 1]?.url || '';
}

export function decodeHtmlEntities(value: string): string {
  if (!value) return '';
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
