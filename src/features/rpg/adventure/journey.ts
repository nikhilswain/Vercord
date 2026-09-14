import type { Point, Rect } from '../../world/engine/types';
import type { AdventureDefinition } from './types';
import { AdventureSession, type AdventureOptions, type AdventureTraveler } from './session';
import { ScenarioProgress } from '../../../domain/adventure/scenario';

/** Owns an expedition: one traveler, persistent encounters per area, no renderer state.
 * A future server/storage adapter can own this same lifecycle outside the demo.
 */
export class AdventureJourney {
  private readonly areas = new Map<string, AdventureSession>();
  private current: AdventureSession | null = null;
  private traveler: AdventureTraveler | undefined;
  private encounterLevel: number | undefined;
  private readonly story: ScenarioProgress;

  constructor(private readonly options: AdventureOptions = {}) {
    this.story = options.scenarioProgress ?? new ScenarioProgress();
    this.encounterLevel = options.enemyLevelOverride;
  }

  enter(
    id: string,
    content: AdventureDefinition,
    colliders: Rect[],
    bounds: Rect,
    spawn: Point,
    arrival: Point,
    casting: { durationMs: number; releaseMs: number },
  ): AdventureSession {
    this.leave();
    let area = this.areas.get(id);
    if (!area) {
      area = new AdventureSession(content, colliders, bounds, spawn, casting, {
        ...this.options,
        progression: this.traveler?.progression ?? this.options.progression,
        enemyLevelOverride: this.encounterLevel,
        safeAreas: content.safeAreas ?? [],
        scenarioProgress: this.story,
      });
      this.areas.set(id, area);
    }
    area.arrive(this.traveler, arrival);
    this.current = area;
    return area;
  }

  leave(rest = false): void {
    if (this.current) {
      if (rest) this.current.rest();
      this.traveler = this.current.traveler();
      this.current.suspend();
      this.current = null;
    } else if (rest && this.traveler) this.traveler.health = 100;
  }

  /** Demo reset applies consistently to visited areas and future spawns. XP stays unique. */
  setEnemyLevel(level: number): boolean {
    if (this.options.enemyLevelOverride === undefined || !this.current?.setEnemyLevel(level))
      return false;
    this.encounterLevel = this.current.encounterLevel;
    for (const area of this.areas.values())
      if (area !== this.current) area.setEnemyLevel(this.encounterLevel);
    this.traveler = this.current.traveler();
    return true;
  }
}
