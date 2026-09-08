import type { RpgSample, RpgThemeId } from './types';
import { buildVillage } from './samples/village';
import { buildDungeon } from './samples/dungeon';
import { buildNorse } from './samples/norse';

export const RPG_SAMPLES: Record<RpgThemeId, RpgSample> = {
  village: buildVillage(),
  norse: buildNorse(),
  dungeon: buildDungeon(),
};

export function getRpgSample(theme: RpgThemeId): RpgSample {
  return RPG_SAMPLES[theme];
}
