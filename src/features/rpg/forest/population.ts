import type { Point } from '../../../domain/world/content/v1/types';
import type { ForestLayout } from '../../../domain/world/forest/layout';
import { FOREST_REGIONS } from '../../../domain/world/forest/catalog';
import { seededRandom, shuffled } from '../../../domain/world/random';
import type {
  AdventureDefinition,
  CreatureKind,
  EncounterSpawn,
  FlowerSpawn,
} from '../adventure/types';
import { ForestHabitat } from './habitat';
import {
  EncounterTerritories,
  encounterReach,
  ROAD_ENCOUNTERS,
  woodlandEncounters,
} from './encounters';

const ANIMALS: readonly CreatureKind[] = [
  'wild-rabbit',
  'wild-bird',
  'wild-deer',
  'wild-stag',
  'wild-fox',
  'wild-boar',
  'wild-wolf',
  'wild-bear',
];
const radiusFor = (kind: CreatureKind) =>
  kind === 'guardian' ? 110 : kind === 'root-beast' ? 100 : kind === 'forest-brute' ? 42 : 26;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Seeded once per region. Separate encounter territories prevent neighboring
 * rolls from turning into a single horde. Save IDs change when placement changes. */
export function populateForest(layout: ForestLayout, seed: string): AdventureDefinition {
  const random = seededRandom(`${seed}:${layout.region}:population-v4`);
  const habitat = new ForestHabitat(layout);
  const territories = new EncounterTerritories();
  const enemies: EncounterSpawn[] = [],
    flowers: FlowerSpawn[] = [];
  const occupied: Array<Point & { radius: number }> = [];
  const sectors = Array.from({ length: 16 }, (_, i) =>
    habitat.points.filter((p) => p.sector === i),
  );
  const woodland = sectors.map((points) => points.filter((p) => !habitat.onRoad(p)));
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const available = (p: Point, radius: number) =>
    habitat.canPlace(p, radius) &&
    habitat.nearTrail(p) &&
    occupied.every((other) => distance(p, other) >= radius + other.radius + 32);
  let encounterIndex = 0;
  const add = (
    kind: CreatureKind,
    p: Point,
    encounter: 'road' | 'woodland',
    encounterId: string,
    elite = false,
  ) => {
    occupied.push({ ...p, radius: radiusFor(kind) });
    enemies.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      id: `${layout.region}-population-v4-${enemies.length}`,
      kind,
      encounter,
      encounterId,
      ...(kind === 'slime' ? { variant: pick(['green', 'green', 'blue', 'pink'] as const)! } : {}),
      ...(elite ? { elite: true } : {}),
      ...(!kind.startsWith('wild-')
        ? {
            levelOffset: (elite ? 2 : 1) + (random() < 0.3 ? 1 : 0),
            patrolRadius: encounter === 'road' ? 32 : 50,
          }
        : {}),
    });
  };

  const placeEncounter = (
    center: Point,
    kinds: readonly CreatureKind[],
    encounter: 'road' | 'woodland',
    elite = false,
  ): boolean => {
    // Vary the quiet space too: never march through evenly spaced copies of a pack.
    const breathingRoom = random() * 64;
    const valid = (p: Point, kind: CreatureKind) =>
      available(p, radiusFor(kind)) &&
      (encounter === 'road' ? habitat.onRoad(p, true, radiusFor(kind)) : !habitat.onRoad(p)) &&
      territories.allows(p, encounterReach(kind) + breathingRoom);
    if (!valid(center, kinds[0]!)) return false;
    const members = [{ ...center, kind: kinds[0]! }];
    // Broad clearings can support a rare trio. Narrow paths get a single or a pair.
    const roomy =
      encounter === 'road' ? habitat.onRoad(center, true, 112) : habitat.canPlace(center, 112);
    const limit = roomy ? 3 : 2;
    for (const kind of kinds.slice(1, limit)) {
      for (let attempt = 0; attempt < 48; attempt++) {
        const angle = random() * Math.PI * 2,
          reach = 104 + random() * 110;
        const p = {
          x: Math.round(center.x + Math.cos(angle) * reach),
          y: Math.round(center.y + Math.sin(angle) * reach),
        };
        if (!valid(p, kind) || members.some((m) => distance(m, p) < 100)) continue;
        members.push({ ...p, kind });
        break;
      }
    }
    const id = `${layout.region}-encounter-v4-${encounterIndex++}`;
    // Commit the whole encounter together, so its own companions share territory.
    for (const member of members) {
      add(member.kind, member, encounter, id, elite);
      territories.add(member, encounterReach(member.kind) + breathingRoom);
    }
    return true;
  };

  // Optional heavy fights reserve clear ground first. Ordinary patrols cannot
  // spawn inside their approach; bosses never head every roadside pack.
  const guardianSectors = shuffled(
    Array.from({ length: 16 }, (_, i) => i),
    random,
  ).slice(0, 2 + Math.floor(random() * 2));
  const placeLarge = (kind: CreatureKind, sector: number) => {
    // Prefer optional side clearings, so a boss territory does not empty a main road.
    const candidates = shuffled(woodland[sector]!, random);
    for (const p of candidates.filter((p) => !habitat.nearTrail(p, 240)))
      if (placeEncounter(p, [kind], 'woodland', true)) return true;
    for (const p of candidates) if (placeEncounter(p, [kind], 'woodland', true)) return true;
    return false;
  };
  const placeRegionalElite = (kind: CreatureKind, preferredSector: number) => {
    for (let offset = 0; offset < 16; offset++)
      if (placeLarge(kind, (preferredSector + offset) % 16)) return;
  };
  for (const sector of guardianSectors) placeRegionalElite('guardian', sector);
  if (['old-ward', 'rootbound-reach', 'elderheart'].includes(layout.region))
    placeRegionalElite('root-beast', (guardianSectors[0]! + 7) % 16);

  // Sample every connecting path, including short bends the old long-road-only
  // pass missed. Global separation handles intersections and overlapping road rects.
  const roadCenters: Point[] = [];
  for (const road of layout.scene.terrain!.roads) {
    const horizontal = road.width > road.height;
    const length = horizontal ? road.width : road.height;
    for (let offset = 48 + random() * 96; offset < length - 32; offset += 128) {
      const lateral = (random() - 0.5) * 24;
      roadCenters.push({
        x: road.x + (horizontal ? offset : road.width / 2 + lateral),
        y: road.y + (horizontal ? road.height / 2 + lateral : offset),
      });
    }
  }
  let roadDeck: (readonly CreatureKind[])[] = [];
  for (const center of shuffled(roadCenters, random)) {
    if (!roadDeck.length) roadDeck = shuffled(ROAD_ENCOUNTERS, random);
    if (placeEncounter(center, roadDeck.at(-1)!, 'road')) roadDeck.pop();
  }
  // A large patrol card must not leave a string of empty smaller road gaps.
  // Fill those with light fights while honoring the same territory separation.
  for (const center of shuffled(roadCenters, random))
    placeEncounter(center, pick([['slime'], ['snake'], ['slime', 'slime']] as const)!, 'road');

  // A bounded number of small woodland encounters per sector. Try the tree edges
  // as well as openings, with the SAME spacing budget as the road encounters.
  const marsh = FOREST_REGIONS[layout.region].terrain === 'marsh';
  const woodlandDeck = woodlandEncounters(marsh);
  for (const sector of shuffled(
    Array.from({ length: 16 }, (_, i) => i),
    random,
  )) {
    const cards = shuffled(woodlandDeck, random).slice(0, 2 + Math.floor(random() * 2));
    const candidates = shuffled(woodland[sector]!, random);
    for (const kinds of cards) {
      for (const p of candidates) if (placeEncounter(p, kinds, 'woodland')) break;
    }
  }

  // Wildlife fills the breathing spaces, not hostile packs. Pairs belong to the
  // timid species; bears, wolves and boars keep separate homes and remain defensive.
  const animalHomes = new EncounterTerritories();
  for (let sector = 0; sector < 16; sector++) {
    for (let n = 0; n < 2; n++) {
      const kind = pick(ANIMALS)!;
      const count =
        ['wild-rabbit', 'wild-bird', 'wild-deer', 'wild-stag'].includes(kind) && random() < 0.6
          ? 2
          : 1;
      const candidates = shuffled(woodland[sector]!, random);
      for (const center of candidates) {
        if (
          !available(center, 26) ||
          !animalHomes.allows(center, 200) ||
          enemies.some((e) => !e.kind.startsWith('wild-') && distance(e, center) < 180)
        )
          continue;
        const id = `${layout.region}-wildlife-v4-${sector}-${n}`;
        add(kind, center, 'woodland', id);
        const homes: Point[] = [center];
        if (count === 2) {
          for (let attempt = 0; attempt < 40; attempt++) {
            const angle = random() * Math.PI * 2,
              reach = 110 + random() * 65;
            const p = {
              x: Math.round(center.x + Math.cos(angle) * reach),
              y: Math.round(center.y + Math.sin(angle) * reach),
            };
            if (
              !habitat.onRoad(p) &&
              available(p, 26) &&
              animalHomes.allows(p, 200) &&
              enemies.every((e) => e.kind.startsWith('wild-') || distance(e, p) >= 180)
            ) {
              add(kind, p, 'woodland', id);
              homes.push(p);
              break;
            }
          }
        }
        for (const home of homes) animalHomes.add(home, 200);
        break;
      }
    }
    for (let plant = 0; plant < 5; plant++) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const p = pick(sectors[sector]!);
        if (!p || !available(p, 20)) continue;
        occupied.push({ ...p, radius: 20 });
        flowers.push({
          x: p.x,
          y: p.y,
          id: `${layout.region}-forage-${sector}-${plant}`,
          kind:
            plant === 0
              ? 'collection'
              : plant === 1
                ? 'mushroom'
                : plant === 2
                  ? 'emberleaf'
                  : 'healing',
        });
        break;
      }
    }
  }
  for (const [i, water] of layout.water.entries()) {
    for (const dx of [-36, water.width + 36]) {
      const p = { x: water.x + dx, y: water.y + water.height / 2 };
      if (habitat.canPlace(p, 20))
        flowers.push({ ...p, id: `${layout.region}-rivercress-${i}-${dx}`, kind: 'rivercress' });
    }
  }
  for (const [i, kind] of (['healing', 'mushroom', 'emberleaf', 'rivercress'] as const).entries()) {
    const p = { x: layout.camp.x - 72 + i * 46, y: layout.camp.y + 110 };
    flowers.push({
      ...p,
      id: `${layout.region}-garden-${i}`,
      kind,
      ...(layout.region === 'verge'
        ? { project: 'verge-bench' }
        : layout.region === 'alder-run'
          ? { project: 'alder-garden' }
          : {}),
    });
  }
  return {
    simulationRadius: 1100,
    safeAreas: habitat.safeAreas,
    enemies,
    flowers,
    water: layout.water,
  };
}
