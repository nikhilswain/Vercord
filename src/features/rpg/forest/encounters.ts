import { enemyBehavior, type CreatureKind } from '../../../domain/adventure/enemies';
import type { Point } from '../../../domain/world/content/v1/types';

/** Most fights are one or two creatures. A ranged enemy never shares a patrol
 * with another ranged enemy; the rare trio is reserved for broad clearings. */
export const ROAD_ENCOUNTERS: readonly (readonly CreatureKind[])[] = [
  ['slime'],
  ['slime'],
  ['slime', 'slime'],
  ['slime', 'slime'],
  ['forest-skirmisher'],
  ['forest-brute'],
  ['forest-skirmisher', 'slime'],
  ['forest-brute', 'slime'],
  ['venus-trap'],
  ['blue-death'],
  ['snake', 'slime'],
  ['slime', 'slime', 'slime'],
];

export function woodlandEncounters(marsh: boolean): readonly (readonly CreatureKind[])[] {
  return [
    ['slime'],
    ['slime'],
    ['slime', 'slime'],
    ['slime', 'slime'],
    ['slime', 'slime', 'slime'],
    ['forest-skirmisher'],
    ['forest-brute'],
    ['venus-trap'],
    ['blue-death'],
    [marsh ? 'venus-trap' : 'bear'],
    [marsh ? 'snake' : 'slime'],
  ];
}

const reaches = new Map<CreatureKind, number>();
/** Reserve fighting space, not just actor footprints. Larger aggro/leash ranges
 * earn more room. Ordinary territories leave room to deliberately pull the next
 * patrol; bosses reserve their entire approach. Local pack sizes remain bounded. */
export function encounterReach(kind: CreatureKind): number {
  let reach = reaches.get(kind);
  if (reach === undefined) {
    const behavior = enemyBehavior(kind, 20);
    const approach = Math.min(behavior.leash, behavior.aggro + 65);
    reach = kind === 'guardian' || kind === 'root-beast' ? approach + 64 : approach * 0.6 + 48;
    reaches.set(kind, reach);
  }
  return reach;
}

interface Territory extends Point {
  radius: number;
}

/** Variable-radius minimum-distance sampling. The index is discarded after
 * generation; no search or allocation is added to the simulation frame loop. */
export class EncounterTerritories {
  private readonly cells = new Map<string, Territory[]>();

  allows(p: Point, radius: number): boolean {
    const visited = new Set<Territory>();
    for (const key of this.keys(p, radius)) {
      for (const other of this.cells.get(key) ?? []) {
        if (visited.has(other)) continue;
        visited.add(other);
        if (Math.hypot(p.x - other.x, p.y - other.y) < radius + other.radius) return false;
      }
    }
    return true;
  }

  add(p: Point, radius: number): void {
    const territory = { ...p, radius };
    for (const key of this.keys(p, radius)) {
      const entries = this.cells.get(key) ?? [];
      entries.push(territory);
      this.cells.set(key, entries);
    }
  }

  private *keys(p: Point, radius: number): Generator<string> {
    for (let x = Math.floor((p.x - radius) / 512); x <= Math.floor((p.x + radius) / 512); x++)
      for (let y = Math.floor((p.y - radius) / 512); y <= Math.floor((p.y + radius) / 512); y++)
        yield `${x}:${y}`;
  }
}
