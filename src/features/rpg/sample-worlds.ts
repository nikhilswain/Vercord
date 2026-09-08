import type { RpgSample, RpgThemeId } from './types';
import { buildVillage } from './samples/village';
import { buildDungeon } from './samples/dungeon';

export const RPG_SAMPLES: Record<RpgThemeId, RpgSample> = {
  village: buildVillage(),
  dungeon: buildDungeon(),
};

export function getRpgSample(theme: RpgThemeId): RpgSample {
  return RPG_SAMPLES[theme];
}
