import type { Point, Rect } from '../../world/engine/types';
import type { AdventureDefinition } from './types';
import { AdventureSession, type AdventureOptions, type AdventureTraveler } from './session';
import { ScenarioProgress, type StoryDialogue } from '../../../domain/adventure/scenario';

/** Owns an expedition: one traveler, persistent encounters per area, no renderer state.
 * A future server/storage adapter can own this same lifecycle outside the demo.
 */
export class AdventureJourney {
  private readonly areas = new Map<string, AdventureSession>();
  private current: AdventureSession;
  private traveler: AdventureTraveler | undefined;
  private encounterLevel: number | undefined;
  private readonly story: ScenarioProgress;
  private readonly camp: AdventureSession;

  /** Inventory/equipment remain available while the traveler is resting in town. */
  get supplies(): AdventureSession {
    return this.current;
  }

  constructor(private readonly options: AdventureOptions = {}) {
    this.story = options.scenarioProgress ?? new ScenarioProgress();
    this.encounterLevel = options.enemyLevelOverride;
    this.camp = new AdventureSession(
      { enemies: [], flowers: [], water: [] },
      [],
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0 },
      undefined,
      { ...options, scenarioProgress: this.story },
    );
    this.current = this.camp;
  }

  blockedEntry(content?: AdventureDefinition): StoryDialogue | null {
    const entry = content?.scenario?.entry;
    return entry && !this.story.matches(entry) ? entry.blocked : null;
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
    const blocked = this.blockedEntry(content);
    if (blocked) throw new Error(`Adventure entry blocked: ${blocked.lines.join(' ')}`);
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
    if (rest) this.current.rest();
    this.traveler = this.current.traveler();
    this.current.suspend();
    this.camp.arrive(this.traveler, { x: 0, y: 0 });
    this.current = this.camp;
  }

  /** Demo reset applies consistently to visited areas and future spawns. XP stays unique. */
  setEnemyLevel(level: number): boolean {
    if (this.options.enemyLevelOverride === undefined || !this.current.setEnemyLevel(level))
      return false;
    this.encounterLevel = this.current.encounterLevel;
    for (const area of this.areas.values())
      if (area !== this.current) area.setEnemyLevel(this.encounterLevel);
    this.traveler = this.current.traveler();
    return true;
  }
}
