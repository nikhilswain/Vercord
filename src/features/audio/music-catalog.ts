/** Add tracks here, then change DEFAULT_BACKGROUND_TRACK to choose the world soundtrack. */
export const MUSIC_TRACKS = [
  {
    id: 'peaceful-village',
    title: 'Peaceful village',
    url: '/game-assets/music/peaceful-village.mp3',
  },
  { id: 'sunset-plains', title: 'Sunset plains', url: '/game-assets/music/sunset-plains.mp3' },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]['id'];
export const DEFAULT_BACKGROUND_TRACK: MusicTrackId = 'peaceful-village';

export function getMusicTrack(id: MusicTrackId) {
  return MUSIC_TRACKS.find((track) => track.id === id)!;
}
