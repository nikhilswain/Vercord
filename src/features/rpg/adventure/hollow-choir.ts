import type { ScenarioDefinition, StoryInteraction } from '../../../domain/adventure/scenario';
import { createStoryBook } from '../../../domain/adventure/storybook';
import content from '../../../content/stories/hollow-choir.json';
import { RITUAL_RELEASE_MS } from './ritual-seal-assets';

export const hollowChoirStory = createStoryBook(content);

export const CHOIR = {
  rootBeast: 'choir.root-beast-defeated',
  westGate: 'choir.west-gate',
  eastGate: 'choir.east-gate',
  westSeal: 'choir.west-seal',
  eastSeal: 'choir.east-seal',
  warden: 'choir.warden-defeated',
  freed: 'choir.keeper-freed',
  supplies: 'choir.supplies',
  notes: 'choir.notes',
  returned: 'choir.returned',
} as const;
const at = (x: number, y: number) => ({ x: x * 32, y: y * 32 });
const seals = [CHOIR.westSeal, CHOIR.eastSeal];

/** Gameplay owns the conditions; the storybook owns every displayed line. */
export function hollowChoirInterior(): ScenarioDefinition {
  const mechanisms: StoryInteraction[] = (['west', 'east'] as const).flatMap((side) => {
    const gate = side === 'west' ? CHOIR.westGate : CHOIR.eastGate;
    const seal = side === 'west' ? CHOIR.westSeal : CHOIR.eastSeal;
    const x = side === 'west' ? 8 : 30;
    return [
      {
        ...hollowChoirStory.interaction(`${side}-lever`),
        id: `${side}-lever`,
        ...at(x, 27),
        action: 'Use',
        grant: [gate],
      },
      {
        ...hollowChoirStory.interaction(`${side}-seal`),
        id: `${side}-seal`,
        ...at(x, 9),
        action: 'Use',
        requires: [gate],
        grant: [seal],
        presentation: { durationMs: RITUAL_RELEASE_MS, pose: 'cast' },
      },
    ];
  });
  const text = hollowChoirStory.objective;
  return {
    title: content.title,
    entry: {
      requires: [CHOIR.rootBeast],
      blocked: hollowChoirStory.interaction('sanctuary-entry').dialogue,
    },
    objectives: [
      { requires: [CHOIR.returned], text: text('interior-complete'), complete: true },
      { requires: [CHOIR.notes], text: text('return-notes') },
      { requires: [CHOIR.freed], text: text('open-reliquary') },
      { requires: [CHOIR.warden], text: text('free-keeper') },
      { requires: seals, text: text('defeat-warden') },
      { requires: [CHOIR.westSeal], text: text('release-sun') },
      { requires: [CHOIR.eastSeal], text: text('release-moon') },
      { text: text('release-both') },
    ],
    interactions: [
      ...mechanisms,
      {
        ...hollowChoirStory.interaction('entry-inscription'),
        id: 'entry-inscription',
        ...at(19, 29),
        action: 'Read',
      },
      {
        ...hollowChoirStory.interaction('cantor'),
        id: 'cantor',
        ...at(19, 7),
        action: 'Talk',
        unless: [CHOIR.freed],
      },
      {
        ...hollowChoirStory.interaction('keeper-release'),
        id: 'keeper-release',
        ...at(19, 9),
        action: 'Use',
        requires: [CHOIR.warden],
        grant: [CHOIR.freed],
      },
      {
        ...hollowChoirStory.interaction('supplies'),
        id: 'supplies',
        ...at(30, 12),
        action: 'Open',
        requires: [CHOIR.eastGate],
        grant: [CHOIR.supplies],
        herbs: 2,
      },
      {
        ...hollowChoirStory.interaction('reliquary'),
        id: 'reliquary',
        ...at(8, 12),
        action: 'Open',
        requires: [CHOIR.freed],
        grant: [CHOIR.notes],
        herbs: 2,
      },
      {
        ...hollowChoirStory.interaction('cantor-restored'),
        id: 'cantor-restored',
        ...at(19, 7),
        action: 'Talk',
        requires: [CHOIR.freed],
      },
    ],
    gates: [
      {
        id: 'west-gate',
        bounds: { ...at(7, 23), width: 96, height: 16 },
        openingFlag: CHOIR.westGate,
        duration: 1.1,
      },
      {
        id: 'east-gate',
        bounds: { ...at(29, 23), width: 96, height: 16 },
        openingFlag: CHOIR.eastGate,
        duration: 1.1,
      },
    ],
    hazards: [
      { id: 'east-blade', ...at(30, 17), radius: 43, damage: 20, unless: [CHOIR.eastSeal] },
      { id: 'hall-blade', ...at(19, 24), radius: 43, damage: 20, unless: [CHOIR.freed] },
    ],
    defeats: [{ enemyId: 'choir-bound-warden', flag: CHOIR.warden }],
  };
}

export function hollowChoirCourtyard(): ScenarioDefinition {
  const text = hollowChoirStory.objective;
  return {
    title: content.title,
    objectives: [
      { requires: [CHOIR.returned], text: text('courtyard-complete'), complete: true },
      { requires: [CHOIR.notes], text: text('give-notes') },
      { requires: [CHOIR.freed], text: text('collect-notes') },
      { requires: [CHOIR.rootBeast], text: text('enter-sanctuary') },
      { text: text('defeat-root-beast') },
    ],
    defeats: [{ enemyId: 'temple-root-beast', flag: CHOIR.rootBeast }],
    interactions: [
      {
        ...hollowChoirStory.interaction('sanctuary-entry'),
        id: 'sanctuary-entry',
        ...at(22, 10.3),
        action: 'Read',
        unless: [CHOIR.rootBeast],
      },
      {
        ...hollowChoirStory.interaction('mira'),
        id: 'mira',
        ...at(20, 35),
        action: 'Talk',
        unless: [CHOIR.freed, CHOIR.notes],
      },
      {
        ...hollowChoirStory.interaction('mira-freed'),
        id: 'mira-freed',
        ...at(20, 35),
        action: 'Talk',
        requires: [CHOIR.freed],
        unless: [CHOIR.notes],
      },
      {
        ...hollowChoirStory.interaction('mira-return'),
        id: 'mira-return',
        ...at(20, 35),
        action: 'Talk',
        requires: [CHOIR.notes],
        grant: [CHOIR.returned],
      },
      { ...hollowChoirStory.interaction('oren'), id: 'oren', ...at(27, 34), action: 'Talk' },
    ],
  };
}
