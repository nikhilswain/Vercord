import type {
  ScenarioDefinition,
  StoryDialogue,
  StoryInteraction,
} from '../../../domain/adventure/scenario';

export const CHOIR = {
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
const speech = (name: string, role: string, ...lines: string[]): StoryDialogue => ({
  name,
  role,
  lines,
  closeLabel: 'Back to exploring',
});
const seals = [CHOIR.westSeal, CHOIR.eastSeal];

export function hollowChoirInterior(): ScenarioDefinition {
  const mechanisms: StoryInteraction[] = (['west', 'east'] as const).flatMap((side) => {
    const gate = side === 'west' ? CHOIR.westGate : CHOIR.eastGate;
    const seal = side === 'west' ? CHOIR.westSeal : CHOIR.eastSeal;
    const x = side === 'west' ? 8 : 30;
    const label = side === 'west' ? 'Moon' : 'Sun';
    return [
      {
        id: `${side}-lever`,
        ...at(x, 27),
        label: `${side} lever`,
        action: 'Use',
        grant: [gate],
        dialogue: speech(
          `${label} mechanism`,
          'An old counterweight',
          `The lever gives with a heavy click. The ${side} gate rises.${side === 'east' ? ' The blade in the sun chamber falls still.' : ''}`,
          `The ${label.toLowerCase()} seal is in the chamber beyond. Its flame is feeding the ritual. Use it to break the binding.`,
        ),
        repeat: speech(
          `${label} mechanism`,
          'The way is open',
          `The ${side} gate is already raised.`,
        ),
      },
      {
        id: `${side}-seal`,
        ...at(x, 9),
        label: `${label.toLowerCase()} seal`,
        action: 'Use',
        requires: [gate],
        grant: [seal],
        dialogue: speech(
          `The ${label.toLowerCase()} seal`,
          'A binding unmade',
          'You turn the engraved stone. The flame gutters; one voice leaves the chorus.',
          'When both seals are quiet, the creature feeding on them will have nowhere left to hide. Be ready in the central hall.',
        ),
        repeat: speech(
          `The ${label.toLowerCase()} seal`,
          'Quiet stone',
          'This binding is already broken.',
        ),
      },
    ];
  });
  return {
    title: 'The Hollow Choir',
    objectives: [
      {
        requires: [CHOIR.returned],
        text: 'The keeper is free. Mira has her notes.',
        complete: true,
      },
      { requires: [CHOIR.notes], text: 'Return the recovered field notes to Mira outside.' },
      { requires: [CHOIR.freed], text: 'Open the reliquary in the west chamber.' },
      { requires: [CHOIR.warden], text: 'Use the altar to release the forest keeper.' },
      { requires: seals, text: 'Defeat the Bound Warden in the central hall.' },
      {
        requires: [CHOIR.westSeal],
        text: 'Release the sun seal in the east chamber. 1 / 2 seals.',
      },
      {
        requires: [CHOIR.eastSeal],
        text: 'Release the moon seal in the west chamber. 1 / 2 seals.',
      },
      { text: 'Use the side-room levers, then release both seals. 0 / 2.' },
    ],
    interactions: [
      ...mechanisms,
      {
        id: 'entry-inscription',
        ...at(19, 29),
        label: 'threshold inscription',
        action: 'Read',
        dialogue: speech(
          'The Hollow Choir',
          'An inscription beneath the dust',
          '“Two lights to bind. Two hands to release. No keeper shall be made a prisoner.”',
          'The choir has mistaken a binding rite for a blessing. Use the levers beside the west and east gates, then silence the seals beyond them. You can return through the south doorway at any time.',
        ),
      },
      {
        id: 'cantor',
        ...at(19, 7),
        label: 'Cantor Vey',
        action: 'Talk',
        unless: [CHOIR.freed],
        dialogue: speech(
          'Cantor Vey',
          'Keeper of the choir · NPC',
          'The roots are closing over our home. We called the keeper to protect us. Why does the forest answer with teeth?',
          'Those flames are ancient. If you know how to quiet them, do it. I cannot stop the chorus alone.',
        ),
      },
      {
        id: 'keeper-release',
        ...at(19, 9),
        label: 'keeper’s altar',
        action: 'Use',
        requires: [CHOIR.warden],
        grant: [CHOIR.freed],
        locked: speech(
          'The bound keeper',
          'A voice under the chorus',
          '“The two lights hold me. The thing below drinks what remains. Break the seals, then defeat it. Only then can you open my binding.”',
        ),
        dialogue: speech(
          'The forest keeper',
          'The last note',
          '“You did not call me here. You listened.”',
          'The binding loosens beneath your hand. The keeper rises like breath from cold stone, and the chorus finally falls silent.',
          'Cantor Vey lowers his hands. “The west reliquary is open to you. Mira’s notes are there. Tell her we mistook possession for protection.”',
        ),
        repeat: speech(
          'The quiet altar',
          'The binding is gone',
          'A little warmth remains in the stone. The keeper has returned to the forest.',
        ),
      },
      {
        id: 'supplies',
        ...at(30, 12),
        label: 'explorer’s supply chest',
        action: 'Open',
        requires: [CHOIR.eastGate],
        grant: [CHOIR.supplies],
        herbs: 2,
        dialogue: speech(
          'An explorer’s supplies',
          'Two healing herbs recovered',
          'Two sealed bundles are still dry. You take the healing herbs. Press H when you need them.',
        ),
        repeat: speech(
          'The supply chest',
          'Already searched',
          'You have already taken its two healing herbs.',
        ),
      },
      {
        id: 'reliquary',
        ...at(8, 12),
        label: 'west reliquary',
        action: 'Open',
        requires: [CHOIR.freed],
        grant: [CHOIR.notes],
        herbs: 2,
        locked: speech(
          'The west reliquary',
          'Held by the binding',
          'Its clasp hums with the same note as the altar. Free the keeper to open it.',
        ),
        dialogue: speech(
          'The recovered field notes',
          'Field notes and two healing herbs',
          'Mira’s missing pages describe the rite as a promise of shelter, never a summons. You tuck them safely away.',
          'You also find two healing herbs. Return through the south doorway and give Mira her notes.',
        ),
        repeat: speech(
          'The west reliquary',
          'Already searched',
          'The field notes are safe with you. Mira is waiting outside.',
        ),
      },
      {
        id: 'cantor-restored',
        ...at(19, 7),
        label: 'Cantor Vey',
        action: 'Talk',
        requires: [CHOIR.freed],
        dialogue: speech(
          'Cantor Vey',
          'A humbled keeper · NPC',
          'We will mend the paths and leave the forest its own voice. No more bindings. You have my word.',
        ),
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
      { id: 'east-blade', ...at(30, 17), radius: 43, damage: 20, unless: [CHOIR.eastGate] },
      { id: 'hall-blade', ...at(19, 24), radius: 43, damage: 20, unless: [CHOIR.freed] },
    ],
    defeats: [{ enemyId: 'choir-bound-warden', flag: CHOIR.warden }],
  };
}

export function hollowChoirCourtyard(): ScenarioDefinition {
  return {
    title: 'The Hollow Choir',
    objectives: [
      {
        requires: [CHOIR.returned],
        text: 'The keeper is free. The forest can heal.',
        complete: true,
      },
      { requires: [CHOIR.notes], text: 'Give Mira her field notes at the southern camp.' },
      { text: 'Meet the explorers, then enter the sanctuary to the north.' },
    ],
    interactions: [
      {
        id: 'mira',
        ...at(20, 35),
        label: 'Mira',
        action: 'Talk',
        unless: [CHOIR.notes],
        dialogue: speech(
          'Mira',
          'Field scholar · NPC',
          'Hear that? Six voices, one note. They have been singing since the roots swallowed the old path.',
          'I went inside with the choir. Their leader meant to save the forest, but the rite bound its keeper. Now something else is feeding on it.',
          'My notes are in the west reliquary. Follow the northern path into the sanctuary. The two side-room levers open the way to the seals. Quiet both flames, face what emerges, then release the keeper at the altar.',
        ),
      },
      {
        id: 'mira-return',
        ...at(20, 35),
        label: 'Mira',
        action: 'Talk',
        requires: [CHOIR.notes],
        grant: [CHOIR.returned],
        dialogue: speech(
          'Mira',
          'The forest can breathe again',
          'You brought the pages back—and listen. No chorus. Just the wind.',
          'These words were a promise to shelter the keeper, not bind it. I will help Vey remember that. Thank you for seeing this through.',
        ),
        repeat: speech(
          'Mira',
          'A story completed',
          'The notes are safe. Next time we enter those ruins, it will be to learn, not to take.',
        ),
      },
      {
        id: 'oren',
        ...at(27, 34),
        label: 'Oren',
        action: 'Talk',
        dialogue: speech(
          'Oren',
          'Expedition scout · NPC',
          'I found the mechanisms. The east lever also brakes the blade in the sun chamber. The west wing has pressure spikes: keep to the clear stones.',
          'There are healing supplies inside. Your way back is always the south doorway. If you fall, you will catch your breath at the entrance; the seals you broke stay broken.',
        ),
      },
    ],
  };
}
