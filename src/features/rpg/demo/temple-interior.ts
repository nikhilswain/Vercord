import { at, block, makeSample } from '../../../domain/world/content/v1/builder';
import type { RpgSample } from '../types';
import type { Rect } from '../../../domain/world/content/v1/types';
import type { ScenarioSprite } from '../adventure/scenario-renderer';
import { TEMPLE_STORY_TEXTURES } from '../adventure/temple-story-assets';
import { TEMPLE_TEXTURES } from '../adventure/temple-assets';
import { RITUAL_TEXTURES } from '../adventure/ritual-seal-assets';
import {
  CHOIR,
  hollowChoirInterior,
  hollowChoirCourtyard,
  hollowChoirStory,
} from '../adventure/hollow-choir';

const frames = (n: number) => Array.from({ length: n }, (_, i) => i);
function prop(
  sample: RpgSample,
  texture: string,
  x: number,
  y: number,
  width: number,
  height: number,
  depth = y * 32,
) {
  sample.stamps.push({ texture, ...at(x, y), width, height, originX: 0.5, originY: 1, depth });
}
function actor(
  sample: RpgSample,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  states: ScenarioSprite['states'],
  label?: string,
  placement: Pick<ScenarioSprite, 'originY' | 'depth' | 'labelOffsetY'> & {
    body?: Rect;
    conversations?: readonly string[];
  } = {},
) {
  const { body, conversations = [], ...visual } = placement;
  const point = at(x, y);
  sample.storySprites!.push({ id, ...point, width, height, states, label, ...visual });
  if (body) {
    const bounds = { ...body, x: point.x + body.x, y: point.y + body.y };
    sample.colliders.push(bounds);
    for (const interaction of sample.demo!.jungle!.scenario!.interactions)
      if (conversations.includes(interaction.id)) interaction.body = bounds;
  }
}

const standingBody = { x: -12, y: -12, width: 24, height: 12 };
const spinningBladeFrames = [6, 7, 8, 9, 10, 11];

function doorway(sample: RpgSample, x: number, y: number, variant: number) {
  prop(sample, `story-gate-shadow-${variant}`, x, y, 96, 96, -10);
  prop(sample, `story-gate-frame-${variant}`, x, y, 96, 96);
  // Only the stone jambs stay solid once the bars rise; the center is a real passage.
  for (const edge of [-48, 30])
    sample.colliders.push({ x: x * 32 + edge, y: y * 32 - 16, width: 18, height: 16 });
}

/** Authored rooms retain native 16px art at 2x, with space for LPC movement and combat. */
export function buildTempleInterior(): RpgSample {
  const sample: RpgSample = makeSample(
    'village',
    hollowChoirStory.content.locations.sanctuary.name,
    hollowChoirStory.content.locations.sanctuary.subtitle,
    at(19, 31),
  );
  sample.bounds = { x: 0, y: 0, width: 38 * 32, height: 35 * 32 };
  sample.background = '#292623';
  sample.textures = [
    ...sample.textures,
    ...TEMPLE_TEXTURES,
    ...TEMPLE_STORY_TEXTURES,
    ...RITUAL_TEXTURES,
  ];
  sample.ritualSeals = [];
  sample.storySprites = [];
  sample.demo = {
    area: 'temple-interior',
    entryFallback: 'temple',
    portals: [{ id: 'sanctuary-return', target: 'temple' }],
    jungle: {
      scenario: hollowChoirInterior(),
      trapVisual: {
        texture: 'story-spikes',
        frames: [0, 2, 5, 6, 10, 0],
        originY: 0.875,
        scale: 2,
      },
      safeAreas: [{ ...at(13, 28), width: 13 * 32, height: 6 * 32 }],
      enemies: [
        {
          id: 'choir-bound-warden',
          kind: 'root-beast',
          name: 'Bound Warden',
          elite: true,
          ...at(19, 17),
          requires: [CHOIR.westSeal, CHOIR.eastSeal],
          unless: [CHOIR.warden, CHOIR.freed],
        },
      ],
      flowers: [],
      water: [],
      traps: [
        { id: 'choir-west-spike-a', ...at(7, 17), offset: 0 },
        { id: 'choir-west-spike-b', ...at(9.5, 15), offset: 0 },
      ],
    },
  };
  for (let y = 4; y < 33; y += 2)
    for (let x = 3; x < 35; x += 2) {
      sample.stamps.push({
        texture: 'story-floor',
        frame: (x * 7 + y * 13) % 11 < 2 ? 2 : (x + y) % 2,
        ...at(x, y),
        width: 64,
        height: 64,
        depth: -90,
      });
    }
  // Solid wall footprints and their visible front edge use the same coordinates.
  const wall = (x: number, y: number) => {
    for (let row = 0; row < 3; row++)
      sample.stamps.push({
        texture: 'story-stone',
        frame: row === 0 ? 12 : row === 1 ? 23 : 34,
        ...at(x, y - 2 + row),
        width: 32,
        height: 32,
        depth: y * 32 + 16,
      });
  };
  for (let x = 2; x < 36; x++) {
    wall(x, 4);
    if (x < 18 || x > 20) wall(x, 33);
  }
  for (let y = 5; y < 33; y++) {
    wall(2, y);
    wall(35, y);
  }
  block(sample, 0, 0, 38, 4.5);
  block(sample, 0, 0, 3, 35);
  block(sample, 35, 0, 3, 35);
  block(sample, 0, 33, 38, 2);
  doorway(sample, 19.5, 33.5, 0);
  for (const x of [12, 25]) {
    for (let y = 5; y <= 23; y++) wall(x, y);
    block(sample, x, 4, 1, 20);
  }
  for (const [left, right] of [
    [3, 7],
    [10, 12],
    [26, 29],
    [32, 35],
  ]) {
    for (let x = left!; x < right!; x++) wall(x, 23);
    block(sample, left!, 23, right! - left!, 0.5);
  }
  for (const [x, y] of [
    [4, 11],
    [11, 20],
    [27, 10],
    [34, 20],
    [15, 27],
    [24, 27],
  ]) {
    prop(sample, 'temple-urns', x!, y!, 64, 64);
    block(sample, x! - 0.5, y! - 0.5, 1, 0.5);
  }
  prop(sample, 'story-winged-statue', 19, 5.5, 256, 192);
  actor(sample, 'keeper-vessel', 19, 9, 96, 96, [
    { requires: [CHOIR.freed], texture: 'story-altar', frames: [0] },
    { texture: 'story-altar', frames: [1] },
  ]);
  block(sample, 18.125, 8.5, 1.8125, 0.4);
  for (const x of [14, 24]) {
    prop(sample, 'story-banners', x, 25, 64, 96);
    block(sample, x - 0.3125, 24.8, 0.625, 0.2);
  }
  prop(sample, 'story-treasure', 8, 6.5, 192, 64, -20);
  for (const [x, y] of [
    [5, 20],
    [32, 20],
    [27, 7],
  ])
    prop(sample, 'story-bones', x!, y!, 64, 64, -15);
  prop(sample, 'temple-rubble', 5, 6, 96, 96);
  prop(sample, 'temple-rubble', 32, 7, 96, 96);

  for (const [side, x, variant] of [
    ['west', 8, 0],
    ['east', 30, 1],
  ] as const) {
    block(sample, x - 0.65, 11.35, 1.3, 0.45);
    const opening = side === 'west' ? CHOIR.westGate : CHOIR.eastGate;
    const seal = side === 'west' ? CHOIR.westSeal : CHOIR.eastSeal;
    actor(sample, `${side}-lever`, x, 27, 80, 64, [
      {
        requires: [opening],
        texture: `story-lever-${variant}`,
        frames: [0, 1, 2, 3, 4],
        duration: 0.5,
        loop: false,
        since: opening,
      },
      { texture: `story-lever-${variant}`, frames: [0] },
    ]);
    doorway(sample, x + 0.5, 23.5, variant);
    actor(sample, `${side}-gate`, x + 0.5, 23.5, 96, 96, [
      {
        requires: [opening],
        texture: `story-gate-${variant}`,
        frames: [5, 6, 7, 8, 9, 10, 11, 0],
        duration: 1.1,
        loop: false,
        since: opening,
      },
      { texture: `story-gate-${variant}`, frames: [5] },
    ]);
    sample.ritualSeals.push({
      id: `${side}-seal`,
      flag: seal,
      kind: side === 'west' ? 'moon' : 'sun',
      ...at(x, 9),
    });
  }
  // Floor hazards rotate around their damage center, unlike feet-anchored NPCs and props.
  actor(
    sample,
    'east-blade',
    30,
    17,
    96,
    96,
    [
      { requires: [CHOIR.eastSeal], texture: 'story-blade', frames: [0] },
      { texture: 'story-blade', frames: spinningBladeFrames, duration: 0.4, essentialMotion: true },
    ],
    undefined,
    { originY: 0.5 },
  );
  actor(
    sample,
    'hall-blade',
    19,
    24,
    96,
    96,
    [
      { requires: [CHOIR.freed], texture: 'story-blade', frames: [0] },
      { texture: 'story-blade', frames: spinningBladeFrames, duration: 0.4, essentialMotion: true },
    ],
    undefined,
    { originY: 0.5 },
  );
  for (const [x, variant, flag] of [
    [8, 0, CHOIR.notes],
    [30, 1, CHOIR.supplies],
  ] as const)
    actor(sample, `chest-${variant}`, x, 12, 80, 64, [
      {
        requires: [flag],
        texture: `story-chest-${variant}`,
        frames: [0, 1, 2, 3],
        duration: 0.5,
        loop: false,
        since: flag,
      },
      { texture: `story-chest-${variant}`, frames: [0] },
    ]);
  for (let i = 0; i < 6; i++) {
    const n = i + 1,
      x = i % 2 === 0 ? 15 : 23,
      y = 9 + Math.floor(i / 2) * 2.5;
    actor(
      sample,
      `cultist-${n}`,
      x,
      y,
      64,
      64,
      [
        {
          requires: [CHOIR.freed],
          texture: `story-cultist-${n}-idle`,
          frames: frames(12),
          duration: 1.2,
        },
        { texture: `story-cultist-${n}-pray`, frames: frames(12), duration: 1.2 },
      ],
      undefined,
      { originY: 29 / 32, body: standingBody },
    );
  }
  actor(
    sample,
    'cantor',
    19,
    7,
    64,
    64,
    [
      { requires: [CHOIR.freed], texture: 'story-leader-idle', frames: frames(12), duration: 1.2 },
      { texture: 'story-leader-summon', frames: frames(14), duration: 1.4 },
    ],
    hollowChoirStory.content.interactions.cantor.label,
    {
      originY: 31 / 32,
      labelOffsetY: 64,
      body: standingBody,
      conversations: ['cantor', 'cantor-restored'],
    },
  );
  actor(sample, 'keeper', 19, 9, 192, 256, [
    {
      requires: [CHOIR.freed],
      texture: 'story-ghost',
      frames: frames(19),
      duration: 1.8,
      loop: false,
      since: CHOIR.freed,
      hideAfter: 1.85,
    },
  ]);
  for (const [i, x, y] of [
    [1, 14, 7],
    [2, 24, 7],
    [3, 5, 25],
    [4, 33, 25],
    [5, 17, 30],
  ] as const)
    actor(sample, `lamp-${i}`, x, y, 80, 80, [
      { texture: `story-lamp-${i}`, frames: frames(6), duration: 0.6 },
    ]);
  sample.landmarks.push({
    id: 'sanctuary-return',
    name: 'Temple courtyard',
    ...at(19, 32),
    radius: 48,
    kind: 'portal',
    description: 'Return to Mira and Oren outside.',
  });
  sample.signage = [
    { ...at(8, 24.4), text: 'Moon chamber', kind: 'place', maxWidth: 160 },
    { ...at(30, 24.4), text: 'Sun chamber', kind: 'place', maxWidth: 160 },
  ];
  return sample;
}

export function addChoirCourtyard(sample: RpgSample): void {
  sample.textures = [...sample.textures, ...TEMPLE_STORY_TEXTURES];
  sample.storySprites = [];
  sample.demo!.jungle!.scenario = hollowChoirCourtyard();
  actor(
    sample,
    'mira',
    20,
    35,
    96,
    96,
    [
      {
        requires: [CHOIR.returned],
        texture: 'story-explorer-idle',
        frames: frames(12),
        duration: 1.5,
      },
      { texture: 'story-explorer-writing', frames: frames(4), duration: 0.8 },
    ],
    hollowChoirStory.content.interactions.mira.label,
    {
      originY: 42 / 48,
      labelOffsetY: 64,
      body: { x: -28, y: -24, width: 66, height: 24 },
      conversations: ['mira', 'mira-freed', 'mira-return'],
    },
  );
  actor(
    sample,
    'oren',
    27,
    34,
    64,
    64,
    [{ texture: 'story-explorer-search', frames: frames(10), duration: 1 }],
    hollowChoirStory.content.interactions.oren.label,
    { originY: 31 / 32, labelOffsetY: 54, body: standingBody, conversations: ['oren'] },
  );
  sample.demo!.portals.push({ id: 'sanctuary-entry', target: 'temple-interior' });
  sample.landmarks.push({
    id: 'sanctuary-entry',
    name: 'sanctuary',
    ...at(22, 10.3),
    radius: 48,
    kind: 'portal',
    description: 'Follow the sound of the choir.',
  });
  sample.name = hollowChoirStory.content.locations.courtyard.name;
  sample.subtitle = hollowChoirStory.content.locations.courtyard.subtitle;
}
