import type { RpgThemeId } from '../content/v1/types';
import type { RpgCharacterId } from './characters';
import type { EntityBehaviorId, EntityKind } from './entities';
import { isHouseSceneId, type RpgSceneId } from './scenes';
import type { WorldThemeId } from './themes';

export interface AmbientPopulationEntry {
  id: string;
  kind: EntityKind;
  name: string;
  role: string;
  appearance?: RpgCharacterId;
  color?: number;
  behavior: EntityBehaviorId;
  lines: readonly string[];
  interaction: AmbientInteraction;
}

export interface AmbientInteraction {
  kind: 'talk' | 'pet';
  durationMs?: number;
}

export const AMBIENT_POPULATION_LIMITS = { overworld: 32, dungeon: 2, house: 0 } as const;
const person = (
  id: string,
  name: string,
  role: string,
  appearance: RpgCharacterId,
  behavior: EntityBehaviorId,
  ...lines: string[]
): AmbientPopulationEntry => ({
  id,
  kind: 'humanoid',
  name,
  role,
  appearance,
  behavior,
  lines,
  interaction: { kind: 'talk' },
});
const animal = (
  id: string,
  name: string,
  kind: 'dog' | 'cat',
  role: string,
  color: number,
  ...lines: string[]
): AmbientPopulationEntry => ({
  id,
  name,
  kind,
  role,
  color,
  behavior: 'wander',
  lines,
  interaction: { kind: 'pet', durationMs: 1400 },
});

/** Decorative residents are runtime content; they never become Discord members or saved NPCs. */
export const WORLD_POPULATIONS = {
  village: [
    person(
      'tamsin',
      'Tamsin',
      'Gardener',
      'tamsin',
      'wander',
      'The mint has escaped its pot again. I admire its ambition.',
    ),
    person(
      'emery',
      'Emery',
      'Village messenger',
      'emery',
      'patrol',
      'A letter, a loaf, a little news. There is always something to carry across the square.',
    ),
    person(
      'linden',
      'Linden',
      'Tea seller',
      'linden',
      'wander',
      'I am testing a blend with apple peel. The whole lane smells like autumn.',
    ),
    person(
      'perrin',
      'Perrin',
      'Bench philosopher',
      'rowan',
      'idle',
      'A busy afternoon is best observed from a quiet corner.',
    ),
    animal(
      'bracken',
      'Bracken',
      'dog',
      'Village dog',
      0xb88652,
      'Bracken offers an enthusiastic tail wag, then checks the lane for familiar footsteps.',
    ),
    animal(
      'biscuit',
      'Biscuit',
      'dog',
      'Bakery dog',
      0xdcc8a1,
      'Biscuit sits hopefully. Every pocket might contain a crumb.',
    ),
    animal(
      'mallow',
      'Mallow',
      'cat',
      'Garden cat',
      0xc99158,
      'Mallow pauses to inspect you, then returns to an urgent patch of sunshine.',
    ),
    animal(
      'soot',
      'Soot',
      'cat',
      'Village cat',
      0x74818c,
      'Soot gives a slow blink. You appear to have passed inspection.',
    ),
  ],
  norse: [
    person(
      'leif',
      'Leif',
      'Trail keeper',
      'leif',
      'patrol',
      'The pine trail is clear today. I have marked the soft ground beyond the bend.',
    ),
    person(
      'runa',
      'Runa',
      'Mender',
      'runa',
      'wander',
      'A good stitch should survive a northern winter. A good story should survive several.',
    ),
    person(
      'eirik',
      'Eirik',
      'Smith',
      'eirik',
      'wander',
      'The hearth is hot enough for iron, and the kettle is nearly ready.',
    ),
    person(
      'astrid',
      'Astrid',
      'Herb keeper',
      'sigrid',
      'idle',
      'Juniper by the door, rosemary by the hearth. A house should smell like home.',
    ),
    animal(
      'fen',
      'Fen',
      'dog',
      'Trail dog',
      0x9b805f,
      'Fen lifts a paw and waits. The trail can wait a moment longer.',
    ),
    animal(
      'birch',
      'Birch',
      'dog',
      'Hearth dog',
      0xd5d5c8,
      'Birch shakes out a thick coat and keeps a friendly eye on the square.',
    ),
    animal(
      'ember',
      'Ember',
      'cat',
      'Smithy cat',
      0xc68650,
      'Ember has claimed the warmest stone in Frosthavn. No negotiation seems possible.',
    ),
    animal(
      'mist',
      'Mist',
      'cat',
      'Pinewood cat',
      0x8d9ba4,
      'Mist watches a drifting leaf as though it carries important news.',
    ),
  ],
} as const satisfies Record<WorldThemeId, readonly AmbientPopulationEntry[]>;

export const VAULT_POPULATION: readonly AmbientPopulationEntry[] = [
  person(
    'edra',
    'Edra',
    'Lamplighter',
    'emery',
    'patrol',
    'I count the lamps on each round. Some evenings I suspect they move when I am not looking.',
  ),
  animal(
    'cinder',
    'Cinder',
    'cat',
    'Vault cat',
    0x8d796c,
    'Cinder has heard every echo in this chamber. Yours is apparently acceptable.',
  ),
];

const NEIGHBOR_NAMES = {
  village: {
    humanoid: [
      'Hazel',
      'Jasper',
      'Nell',
      'Otis',
      'Faye',
      'Bram',
      'Cora',
      'Hollis',
      'Ada',
      'Felix',
      'June',
      'Milo',
    ],
    dog: ['Clover', 'Rusty', 'Poppy', 'Teddy', 'Scout', 'Maple'],
    cat: ['Peaches', 'Juniper', 'Olive', 'Acorn', 'Moss', 'Thimble'],
  },
  norse: {
    humanoid: [
      'Freya',
      'Soren',
      'Inga',
      'Arvid',
      'Liv',
      'Torsten',
      'Kari',
      'Sten',
      'Alva',
      'Nils',
      'Tove',
      'Vidar',
    ],
    dog: ['Flint', 'Rune', 'Frost', 'Alder', 'Storm', 'Ridge'],
    cat: ['Ashen', 'Pebble', 'Snow', 'Lichen', 'Glimmer', 'Slate'],
  },
} as const;

export function ambientPopulationFor(
  theme: RpgThemeId,
  scene: RpgSceneId,
  requestedCount = 8,
): readonly AmbientPopulationEntry[] {
  if (isHouseSceneId(scene)) return [];
  if (scene === 'dungeon') return VAULT_POPULATION.slice(0, AMBIENT_POPULATION_LIMITS.dungeon);
  const world = theme === 'dungeon' ? 'village' : theme;
  const roster = WORLD_POPULATIONS[world];
  const count = Math.max(
    8,
    Math.min(AMBIENT_POPULATION_LIMITS.overworld, Math.floor(requestedCount)),
  );
  const extra = { humanoid: 0, dog: 0, cat: 0 };
  return Array.from({ length: count }, (_, index) => {
    const entry = roster[index % roster.length]!;
    if (index < roster.length) return entry;
    const name = NEIGHBOR_NAMES[world][entry.kind][extra[entry.kind]++]!;
    return {
      ...entry,
      id: `${entry.id}-${Math.floor(index / roster.length) + 1}`,
      name,
      lines: entry.lines.map((line) => line.replaceAll(entry.name, name)),
    };
  });
}
