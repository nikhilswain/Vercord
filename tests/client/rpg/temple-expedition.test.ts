import { describe, expect, it } from 'vitest';
import { buildTempleDemo } from '../../../src/features/rpg/demo/forest-expansion';
import { buildTempleInterior } from '../../../src/features/rpg/demo/temple-interior';
import { buildTempleLayout } from '../../../src/domain/world/forest/temple';
import { buildForestLayout } from '../../../src/domain/world/forest/layout';
import {
  forestAreaIdSchema,
  forestSceneId,
  TEMPLE_AREA_IDS,
} from '../../../src/domain/world/forest/catalog';
import {
  containsRect,
  footprint,
  overlaps,
  WORLD_PLAYER_FEET,
} from '../../../src/domain/world/geometry';
import { templeSamples } from '../../../src/features/rpg/forest/temple-presentation';
import { presentForest, PREVIEW_FOREST_SEED } from '../../../src/features/rpg/forest/presentation';
import { AdventureJourney } from '../../../src/features/rpg/adventure/journey';
import { CHOIR } from '../../../src/features/rpg/adventure/hollow-choir';
import { navigationContext, regionRoute } from '../../../src/features/rpg/navigation/destinations';
import { RpgPathfinder } from '../../../src/features/rpg/pathfinding';
import { readRpgRoute, writeRpgRoute } from '../../../src/features/rpg/themes';
import { rpgLocationSchema } from '../../../src/domain/presence/rpg-protocol';
import { itemCount } from '../../../src/domain/adventure/inventory';
import type { RpgSample } from '../../../src/features/rpg/types';
import type { AdventureSession } from '../../../src/features/rpg/adventure/session';

const courtyard = templeSamples[0]!,
  sanctuary = templeSamples[1]!;
const casting = { durationMs: 650, releaseMs: 300 };
const enter = (journey: AdventureJourney, sample: RpgSample) =>
  journey.enter(
    sample.adventure!.id,
    sample.adventure!.definition!,
    sample.colliders,
    sample.bounds,
    sample.spawn,
    sample.spawn,
    casting,
  );
function use(session: AdventureSession, id: string) {
  const interaction = session.scenario!.definition.interactions.find((i) => i.id === id)!;
  // Stand below solid NPCs/chests instead of interacting through their collision footprint.
  const point = { x: interaction.x, y: interaction.y + 24 };
  expect(session.nearbyStory(point)?.id).toBe(id);
  session.interactStory(point);
  for (let frame = 0; frame < 40; frame++) session.tick(0.05, point);
  session.takeStoryDialogue();
}

describe('server expedition temple', () => {
  it.each(TEMPLE_AREA_IDS)(
    '%s publishes the same collision geometry as the authored chapter',
    (area) => {
      const authored = area === 'temple' ? buildTempleDemo() : buildTempleInterior();
      const { scene, portals } = buildTempleLayout(area);
      expect(scene.bounds).toEqual(authored.bounds);
      expect(scene.spawn).toEqual(authored.spawn);
      expect(scene.colliders.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(
        authored.colliders,
      );
      const paths = new RpgPathfinder(scene.bounds, scene.colliders, WORLD_PLAYER_FEET);
      for (const portal of portals) {
        expect(authored.landmarks.find((p) => p.id === portal.id)).toMatchObject({
          x: portal.x,
          y: portal.y,
        });
        const arrival = { x: portal.x, y: portal.y + 24 };
        expect(containsRect(scene.bounds, footprint(arrival))).toBe(true);
        expect(scene.colliders.some((c) => overlaps(footprint(arrival), c))).toBe(false);
        expect(paths.findPath(scene.spawn, portal).length).toBeGreaterThan(0);
      }
      const route = { theme: 'village' as const, world: 'village' as const, forest: area };
      expect(
        readRpgRoute(writeRpgRoute(new URL('http://localhost/play/123'), route).search),
      ).toEqual(route);
      expect(forestAreaIdSchema.safeParse(area).success).toBe(true);
      expect(
        rpgLocationSchema.safeParse({
          ...scene.spawn,
          scene: forestSceneId(area),
          action: 'idle',
          direction: 'down',
        }).success,
      ).toBe(true);
    },
  );

  it('connects the authored chapter to a reachable Rootbound clearing and routes home', () => {
    const layout = buildForestLayout(PREVIEW_FOREST_SEED, 'rootbound-reach');
    const portal = layout.portals.find((p) => p.target === 'temple')!;
    const paths = new RpgPathfinder(
      layout.scene.bounds,
      layout.scene.colliders,
      WORLD_PLAYER_FEET,
      layout.scene.terrain!.roads,
    );
    const route = paths.findPath(layout.scene.spawn, portal);
    expect(Math.hypot(route.at(-1)!.x - portal.x, route.at(-1)!.y - portal.y)).toBeLessThan(20);
    expect(regionRoute('town', 'temple-interior').slice(-3)).toEqual([
      'rootbound-reach',
      'temple',
      'temple-interior',
    ]);
    expect(regionRoute('temple-interior', 'town').slice(0, 3)).toEqual([
      'temple-interior',
      'temple',
      'rootbound-reach',
    ]);
    expect(courtyard.demo).toBeUndefined();
    expect(sanctuary.adventure?.id).toBe('forest:temple-interior');
  });

  it('continues existing forest saves into the real temple, with guidance still opt-in', () => {
    const forest = presentForest({
      contentVersion: 'mosswild-v1',
      worldId: PREVIEW_FOREST_SEED,
      seed: PREVIEW_FOREST_SEED,
      region: 'alder-run',
    });
    let journey = new AdventureJourney();
    for (const id of ['verge-site-1', 'verge-site-4', 'alder-run-site-2']) journey.discover(id);
    journey = new AdventureJourney({ snapshot: journey.snapshot() });
    const journal = journey.journal(forest, [forest, ...templeSamples]);
    expect(journal.completed).toHaveLength(3);
    expect(journal.mode).toBe('explore');
    expect(journal.pinned).toBeNull();
    expect(journal.objective?.title).toBe('Meet Mira at the ruins');
    expect(journal.objective?.target).toMatchObject({ scene: 'forest:temple', area: 'temple' });
    const paths = new RpgPathfinder(
      forest.bounds,
      forest.colliders,
      WORLD_PLAYER_FEET,
      forest.terrain!.roads,
    );
    const resolved = navigationContext(forest, paths).resolve(journal.objective!.target);
    expect(resolved).toMatchObject({ id: 'trail-fern-hollow' });
    expect(journey.blockedEntry(sanctuary.adventure!.definition)).not.toBeNull();
    expect(() => enter(journey, sanctuary)).toThrow('Adventure entry blocked');
  });

  it.each([
    ['west', 'east'],
    ['east', 'west'],
  ])('persists the complete chapter with %s seal first', (first, second) => {
    let journey = new AdventureJourney();
    journey.discover('temple:entered'); // Explorers can reach it before the forest clues.
    let outside = enter(journey, courtyard);
    use(outside, 'mira');
    expect(journey.journal(courtyard, templeSamples).objective?.id).toBe(
      'guardian:temple-root-beast',
    );
    outside.enemies.find((e) => e.id === 'temple-root-beast')!.health = 0;
    outside.tick(0.016, courtyard.spawn);
    journey = new AdventureJourney({ snapshot: journey.snapshot() });
    expect(journey.blockedEntry(sanctuary.adventure!.definition)).toBeNull();
    let inside = enter(journey, sanctuary);
    const warden = () => inside.enemies.find((e) => e.id === 'choir-bound-warden')!;
    expect(inside.isEnemyActive(warden())).toBe(false);
    use(inside, `${first}-lever`);
    use(inside, `${first}-seal`);
    expect(inside.isEnemyActive(warden())).toBe(false);
    journey = new AdventureJourney({ snapshot: journey.snapshot() });
    inside = enter(journey, sanctuary);
    use(inside, `${second}-lever`);
    use(inside, `${second}-seal`);
    expect(inside.isEnemyActive(warden())).toBe(true);
    expect(journey.journal(sanctuary, templeSamples).objective?.id).toBe(
      'warden:choir-bound-warden',
    );
    warden().health = 0;
    inside.tick(0.016, sanctuary.spawn);
    use(inside, 'keeper-release');
    use(inside, 'reliquary');
    expect(itemCount(inside.getInventory(), 'mira-notes')).toBe(1);
    journey = new AdventureJourney({ snapshot: journey.snapshot() });
    outside = enter(journey, courtyard);
    expect(outside.enemies.find((e) => e.id === 'temple-root-beast')!.health).toBe(0);
    use(outside, 'mira-return');
    expect(itemCount(outside.getInventory(), 'mira-notes')).toBe(0);
    const completed = new AdventureJourney({ snapshot: journey.snapshot() });
    expect(completed.snapshot().story).toContain(CHOIR.returned);
    expect(completed.journal(courtyard, templeSamples).objective).toBeNull();
    expect(completed.journal(courtyard, templeSamples).recap).toContain('Mira has her notes');
    expect(completed.journal(courtyard, templeSamples).mode).toBe('explore');
  });
});
