import { FOREST_REGIONS, type ForestRegionId } from '../../../domain/world/forest/catalog';
import { CHOIR } from '../adventure/hollow-choir';
import { DEMO_AREA_NAMES, type DemoArea } from '../demo/types';
import type { NavigationTarget } from '../navigation/types';
import type { RpgSample } from '../types';
import { navigationScene } from '../navigation/destinations';

export interface JournalPreferences {
  mode: 'explore' | 'story';
  pinned: string | null;
}
export interface JournalObjective {
  id: string;
  title: string;
  detail: string;
  location: string;
  target: Extract<NavigationTarget, { kind: 'story' }>;
}
export interface JourneyJournal extends JournalPreferences {
  title: string;
  chapter: string;
  recap: string;
  completed: string[];
  objective: JournalObjective | null;
  visited: number;
  discoveries: number;
  saveAvailable: boolean;
}
interface Progress extends JournalPreferences {
  facts: readonly string[];
  visited: readonly ForestRegionId[];
  discovered: readonly string[];
  saveAvailable: boolean;
}

/** Only implemented events belong here. The full campaign outline is not a quest manifest. */
const forestLeads = [
  {
    region: 'verge',
    site: 1,
    title: 'Find Juniper’s field camp',
    detail:
      'Look for the plant sketches beneath a dry branch in Mosswild Verge. They may explain where the old paths lead.',
    recap: 'Juniper’s sketches point east along the alder stream, and north toward still water.',
  },
  {
    region: 'verge',
    site: 4,
    title: 'Find the leaning milestone',
    detail:
      'Look for the weathered milestone in Mosswild Verge. Read what remains of its directions.',
    recap:
      'The milestone names Stillwater. A second arrow has been scratched away, leaving the word “Choir”.',
  },
  {
    region: 'alder-run',
    site: 2,
    title: 'Trace the old millrace',
    detail:
      'Take the eastern waygate into Alder Run and find the abandoned water channel. Its bend points onward to Fern Hollow.',
    recap:
      'The millrace points through Fern Hollow and Lantern Wood to Rootbound Reach. The old Choir belongs to a temple, and Mira is surveying its courtyard.',
  },
] satisfies Array<{
  region: ForestRegionId;
  site: number;
  title: string;
  detail: string;
  recap: string;
}>;

export function buildJournal(
  sample: RpgSample,
  samples: readonly RpgSample[],
  progress: Progress,
): JourneyJournal {
  const base = {
    mode: progress.mode,
    pinned: progress.pinned,
    visited: progress.visited.length,
    discoveries: progress.discovered.length,
    saveAvailable: progress.saveAvailable,
  };
  const forest =
    sample.temple ||
    sample.forest ||
    sample.forestPortals?.length ||
    samples.some((s) => s.forestPortals?.length) ||
    (!sample.demo && progress.visited.length > 0);
  const done = (lead: (typeof forestLeads)[number]) =>
    progress.discovered.includes(`${lead.region}-site-${lead.site}`);
  const templeAvailable = samples.some((s) => s.temple === 'temple');
  const templeStarted =
    sample.temple ||
    progress.discovered.includes('temple:entered') ||
    Object.values(CHOIR).some((flag) => progress.facts.includes(flag));
  if (forest && (!templeAvailable || (!templeStarted && forestLeads.some((lead) => !done(lead))))) {
    const next = forestLeads.find((lead) => !done(lead));
    const latest = forestLeads.filter(done).at(-1);
    const id = next ? `${next.region}-site-${next.site}` : '';
    const point = sample.forest?.sites.find((site) => site.id === id) ?? { x: 0, y: 0 };
    return {
      ...base,
      title: 'A voice beyond the trees',
      chapter: 'Opening · The old forest paths',
      recap:
        latest?.recap ??
        'The town’s waygate opens onto Mosswild Verge. Juniper left field sketches there. Start with those clues, or take any trail that catches your eye.',
      completed: forestLeads.filter(done).map((lead) => lead.title),
      objective: next
        ? {
            id,
            title: next.title,
            detail: next.detail,
            location: FOREST_REGIONS[next.region].name,
            target: {
              id: `story:${id}`,
              kind: 'story',
              name: next.title,
              scene: `forest:${next.region}`,
              area: next.region,
              siteId: id,
              point: { x: point.x, y: point.y },
              radius: 100,
            },
          }
        : null,
    };
  }
  const has = (flag: string) => progress.facts.includes(flag);
  const steps: Array<{
    id: string;
    title: string;
    detail: string;
    area: DemoArea;
    actor: string;
    enemy?: boolean;
    done: boolean;
  }> = [
    {
      id: 'mira',
      title: 'Meet Mira at the ruins',
      detail: forest
        ? 'Follow the forest paths to Rootbound Reach (via Fern Hollow and Lantern Wood from Alder Run). Enter the Rootbound Temple arch at the outer approach, then speak with Mira in the southern courtyard. You can explore freely or choose Guide me.'
        : 'From Willowmere, follow the jungle into Fern Hollow, then take the path to Rootbound Temple. Mira waits at the southern camp.',
      area: 'temple',
      actor: 'mira',
      done: has(CHOIR.metMira) || has(CHOIR.rootBeast),
    },
    {
      id: 'guardian',
      title: 'Defeat the courtyard Root Beast',
      detail:
        'The Root Beast has sealed the sanctuary entrance. Defeat it in the courtyard to open the northern doorway.',
      area: 'temple',
      actor: 'temple-root-beast',
      enemy: true,
      done: has(CHOIR.rootBeast),
    },
    {
      id: 'moon',
      title: 'Release the moon seal',
      detail: has(CHOIR.westGate)
        ? 'The west gate is open. Use the moon seal in the west chamber.'
        : 'Enter the sanctuary. Raise the west gate with its lever, then release the moon seal. The two seals can be released in either order.',
      area: 'temple-interior',
      actor: has(CHOIR.westGate) ? 'west-seal' : 'west-lever',
      done: has(CHOIR.westSeal),
    },
    {
      id: 'sun',
      title: 'Release the sun seal',
      detail: has(CHOIR.eastGate)
        ? 'Use the sun seal in the east chamber. Releasing it also stops the chamber’s blade.'
        : 'Raise the east gate with its lever, then release the sun seal. Watch for the blade on the way.',
      area: 'temple-interior',
      actor: has(CHOIR.eastGate) ? 'east-seal' : 'east-lever',
      done: has(CHOIR.eastSeal),
    },
    {
      id: 'warden',
      title: 'Defeat the Bound Warden',
      detail:
        'Both seals are released. The creature feeding on the binding is exposed in the central hall.',
      area: 'temple-interior',
      actor: 'choir-bound-warden',
      enemy: true,
      done: has(CHOIR.warden),
    },
    {
      id: 'keeper',
      title: 'Free the forest keeper',
      detail: 'Use the altar in the central hall to release the keeper from its borrowed form.',
      area: 'temple-interior',
      actor: 'keeper-release',
      done: has(CHOIR.freed),
    },
    {
      id: 'notes',
      title: 'Recover Mira’s field notes',
      detail: 'Open the reliquary in the west chamber. Mira left her field notes there.',
      area: 'temple-interior',
      actor: 'reliquary',
      done: has(CHOIR.notes),
    },
    {
      id: 'return',
      title: 'Return the notes to Mira',
      detail: 'Leave the sanctuary and speak with Mira at the southern camp.',
      area: 'temple',
      actor: 'mira-return',
      done: has(CHOIR.returned),
    },
  ];
  const available = forest ? templeAvailable : samples.some((s) => s.demo?.area === 'temple');
  const next = available ? steps.find((step) => !step.done) : undefined;
  const destination = next
    ? samples.find((s) => (forest ? s.temple : s.demo?.area) === next.area)
    : undefined;
  const content = destination?.adventure?.definition ?? destination?.demo?.jungle;
  const point = next?.enemy
    ? content?.enemies.find((e) => e.id === next.actor)
    : content?.scenario?.interactions.find((i) => i.id === next?.actor);
  const completed = [
    ...(forest ? forestLeads.filter(done).map((lead) => lead.title) : []),
    ...steps.filter((step) => step.done).map((step) => step.title),
  ];
  return {
    ...base,
    title: available ? 'The Hollow Choir' : 'Your journey',
    chapter: !available
      ? 'Between adventures'
      : has(CHOIR.returned)
        ? 'A promise restored'
        : has(CHOIR.warden)
          ? 'The keeper’s freedom'
          : has(CHOIR.rootBeast)
            ? 'Two lights to silence'
            : 'Voices in the ruins',
    recap: !available
      ? 'Explore the town and its paths. Your journal will keep the leads you find along the way.'
      : has(CHOIR.returned)
        ? 'The keeper is free, the choir is silent, and Mira has her notes. The promise of shelter can begin again.'
        : has(CHOIR.freed)
          ? 'The keeper has returned to the forest. Mira’s field notes are still part of your promise.'
          : has(CHOIR.rootBeast)
            ? 'The entrance seal is broken. Inside, the sun and moon seals hold the keeper in a binding.'
            : has(CHOIR.metMira)
              ? 'Mira needs help ending the binding inside the temple and recovering her field notes.'
              : forest
                ? 'The forest’s old paths lead to Rootbound Temple in Rootbound Reach. The choir is binding a forest keeper. Mira waits in the courtyard; find her to learn how to break it.'
                : 'Beyond Fern Hollow, voices carry from Rootbound Temple. Find Mira at the ruins to learn what happened.',
    completed,
    objective:
      next && point
        ? {
            id: `${next.id}:${next.actor}`,
            title: next.title,
            detail: next.detail,
            location: DEMO_AREA_NAMES[next.area],
            target: {
              kind: 'story',
              id: `story:${next.id}:${next.actor}`,
              name: next.title,
              scene: destination ? navigationScene(destination) : next.area,
              ...(destination?.temple ? { area: destination.temple } : {}),
              point: { x: point.x, y: point.y },
              radius: next.enemy ? 110 : 48,
            },
          }
        : null,
  };
}

export function isStoryNavigation(target?: NavigationTarget | null): boolean {
  return target?.kind === 'story';
}

export function objectivePoint(sample: RpgSample, objective?: JournalObjective | null) {
  if (!objective || objective.target.scene !== navigationScene(sample)) return undefined;
  return objective.target.siteId
    ? sample.forest?.sites.find((site) => site.id === objective.target.siteId)
    : objective.target.point;
}
