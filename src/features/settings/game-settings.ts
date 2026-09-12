export interface GameSettings {
  version: 1;
  audio: { backgroundVolume: number };
}

export const GAME_SETTINGS_KEY = 'dmap:game-settings:v1';
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: 1,
  audio: { backgroundVolume: 35 },
};

export function backgroundVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.max(0, Math.min(100, value)))
    : DEFAULT_GAME_SETTINGS.audio.backgroundVolume;
}

export function parseGameSettings(raw: string | null): GameSettings {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<GameSettings> | null;
    if (value?.version !== 1) return DEFAULT_GAME_SETTINGS;
    return {
      version: 1,
      audio: { backgroundVolume: backgroundVolume(value.audio?.backgroundVolume) },
    };
  } catch {
    return DEFAULT_GAME_SETTINGS;
  }
}
