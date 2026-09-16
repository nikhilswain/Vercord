import { WILDLIFE, type WildlifeKind } from '../../../domain/adventure/wildlife';
import type { JungleWildlifeAsset, JungleWildlifeAnimation } from '../demo/wildlife-assets';

type AnimalAsset = Omit<JungleWildlifeAsset, 'id'> & { id: WildlifeKind };
function asset(
  id: WildlifeKind,
  file: string,
  columns: number,
  rows: number[],
  attackRow: number,
  hurtRow: number,
  deathRow: number,
): AnimalAsset {
  const bird = id === 'wild-bird';
  const size = bird ? 16 : 32;
  function animation(row: number, durationMs: number, loop: boolean): JungleWildlifeAnimation {
    const frames = Array.from({ length: rows[row]! }, (_, i) => row * columns + i);
    return { durationMs, loop, frames: { up: frames, down: frames, left: frames, right: frames } };
  }
  const combat = WILDLIFE[id].combat;
  return {
    id,
    textureKey: `minifolks-${id}`,
    imageUrl: `/game-assets/minifolks-animals/${file}.png`,
    sourceUrl: 'https://lyaseek.itch.io/miniffanimals',
    author: 'LYASeeK',
    license: 'Game use permitted; do not resell the assets',
    licenseUrl: '/game-assets/minifolks-animals/CREDITS.txt',
    frameWidth: size,
    frameHeight: size,
    columns,
    frameCount: columns * rows.length,
    feet: { x: size / 2, y: size - 1 },
    origin: { x: 0.5, y: (size - 1) / size },
    suggestedScale: 2,
    flipXDirections: ['left'],
    animations: {
      idle: animation(0, 900, true),
      walk: animation(1, bird ? 360 : 520, true),
      attack: { ...animation(attackRow, combat.durationMs, false), impactAtMs: combat.impactMs },
      hurt: animation(hurtRow, 240, false),
      death: animation(deathRow, 650, false),
    },
    animationNotes: [
      'Unmodified outlined source sheet. Native right-facing frames mirrored for left; vertical travel retains the last horizontal facing.',
      ...(bird ? ['Bird has idle, fly and death only; idle is held for hit feedback.'] : []),
    ],
  };
}
export const FOREST_WILDLIFE_ASSETS: Readonly<Record<WildlifeKind, AnimalAsset>> = {
  'wild-bird': asset('wild-bird', 'MiniBird', 4, [4, 4, 3], 0, 0, 2),
  'wild-rabbit': asset('wild-rabbit', 'MiniBunny', 4, [4, 4, 2, 3], 0, 2, 3),
  'wild-fox': asset('wild-fox', 'MiniFox', 6, [4, 4, 3, 6, 2, 4], 3, 4, 5),
  'wild-wolf': asset('wild-wolf', 'MiniWolf', 7, [4, 6, 4, 5, 5, 7, 2, 4], 3, 6, 7),
  'wild-boar': asset('wild-boar', 'MiniBoar', 5, [4, 4, 3, 5, 2, 4], 3, 4, 5),
  'wild-deer': asset('wild-deer', 'MiniDeer1', 5, [4, 4, 3, 5, 2, 4], 3, 4, 5),
  'wild-stag': asset('wild-stag', 'MiniDeer2', 7, [4, 4, 3, 5, 7, 2, 4], 3, 5, 6),
  'wild-bear': asset('wild-bear', 'MiniBear', 10, [4, 6, 3, 6, 5, 10, 2, 4], 3, 6, 7),
};
export function forestWildlifeAsset(kind: string): AnimalAsset | undefined {
  return Object.hasOwn(FOREST_WILDLIFE_ASSETS, kind)
    ? FOREST_WILDLIFE_ASSETS[kind as WildlifeKind]
    : undefined;
}
