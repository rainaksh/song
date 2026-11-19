export type AudioQuality = '320kbps' | '160kbps' | '96kbps';

export type RepeatMode = 'off' | 'all' | 'one';

export type AppView =
  | 'discover'
  | 'search'
  | 'videos'
  | 'favorites'
  | 'queue'
  | 'detail';

export type MediaKind = 'audio' | 'video';

export type EraFilter = 'all' | 'classic' | 'retro' | 'modern' | 'latest';

export type SortOrder = 'relevance' | 'oldest' | 'newest';

export interface MediaAsset {
  quality: string;
  url: string;
}

export interface Track {
  id: string;
  kind: MediaKind;
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
  streams: MediaAsset[];
}

export interface AlbumSummary {
  id: string;
  title: string;
  artist: string;
  year: string;
  language: string;
  songCount?: number;
  artwork: {
    small: string;
    medium: string;
    large: string;
  };
}

export interface PlaylistSummary {
  id: string;
  title: string;
  subtitle: string;
  songCount?: number;
  language: string;
  artwork: {
    small: string;
    medium: string;
    large: string;
  };
}

export interface ArtistSummary {
  id: string;
  name: string;
  role: string;
  artwork: {
    small: string;
    medium: string;
    large: string;
  };
}

export interface DiscoverShelf {
  id: string;
  title: string;
  subtitle: string;
  eraLabel: string;
  query: string;
  kind: MediaKind;
  tracks: Track[];
}

export interface DiscoverPayload {
  shelves: DiscoverShelf[];
  playlists: PlaylistSummary[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  bhojpuriArtists?: ArtistSummary[];
}

export interface SearchResponse {
  query: string;
  correctedQuery?: string;
  tracks: Track[];
  videos: Track[];
  similar: Track[];
  albums: AlbumSummary[];
  playlists: PlaylistSummary[];
  artists: ArtistSummary[];
}

export interface CollectionDetail {
  type: 'album' | 'playlist' | 'artist';
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  artwork: string;
  tracks: Track[];
  albums?: AlbumSummary[];
}

export interface LyricLine {
  time: number | null;
  text: string;
}

export interface LyricsResponse {
  synced: boolean;
  lines: LyricLine[];
  source?: string;
  instrumental?: boolean;
}
