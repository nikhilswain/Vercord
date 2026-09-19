import { renewalSchema } from '../../../domain/adventure/renewal';
import { sanitizeProvisions } from '../../../domain/adventure/provisions';
import { sanitizeSpellCooldowns } from '../../../domain/adventure/spells';
import type { Point, Rect } from '../../world/engine/types';
import type { AdventureDefinition } from './types';
import { AdventureSession, type AdventureOptions, type AdventureTraveler } from './session';
import { ScenarioProgress, type StoryDialogue } from '../../../domain/adventure/scenario';
import { z } from 'zod';
import { sanitizeInventory, getItem, type ItemId } from '../../../domain/adventure/inventory';
import { sanitizePlayerProgression } from '../../../domain/adventure/equipment';
import { forestRegionIdSchema, type ForestRegionId } from '../../../domain/world/forest/catalog';
import { buildJournal, type JournalPreferences, type JourneyJournal } from '../journal/model';
import type { RpgSample } from '../types';

const ids = z.array(z.string().min(1).max(128)).max(2000);
const lootSchema = z.strictObject({
  id: z.string().min(1).max(160),
  sourceId: z.string().min(1).max(128),
  itemId: z
    .string()
    .refine((id) => Boolean(getItem(id)))
    .transform((id) => id as ItemId),
  quantity: z.number().int().min(1).max(9999),
  x: z.number().finite(),
  y: z.number().finite(),
});
const encounterSnapshotSchema = z.strictObject({
  renewals: renewalSchema.optional(),
  claimedCaches: ids.optional(),
  defeated: ids,
  gathered: ids,
  rewarded: ids,
  // One obsolete/corrupt pickup must not reset a saved expedition or discard good drops.
  loot: z
    .array(z.unknown())
    .max(4000)
    .transform((entries) =>
      entries.flatMap((entry) => {
        const parsed = lootSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([])
    .optional(),
});
const snapshotSchema = z.strictObject({
  version: z.literal(1),
  traveler: z.strictObject({
    inventory: z.unknown().transform(sanitizeInventory),
    progression: z.unknown().transform((value) => sanitizePlayerProgression(value)),
    health: z.number().finite().min(0).max(120),
    provisions: z.unknown().optional().transform(sanitizeProvisions),
    spellCooldowns: z.unknown().optional().transform(sanitizeSpellCooldowns),
    herbs: z.number().int().min(0).max(9999),
    spell: z.enum(['fire', 'water']),
    combatMode: z.enum(['fire', 'water', 'melee']),
  }),
  story: ids,
  journal: z
    .strictObject({ mode: z.enum(['explore', 'story']), pinned: z.string().max(128).nullable() })
    .optional(),
  visited: z.array(forestRegionIdSchema).max(12),
  discovered: ids,
  areas: z
    .array(z.strictObject({ id: z.string().min(1).max(128), state: encounterSnapshotSchema }))
    .max(32),
});
export type JourneySnapshot = z.infer<typeof snapshotSchema>;
type JourneyOptions = AdventureOptions & {
  snapshot?: unknown;
  persist?(snapshot: JourneySnapshot): boolean | void;
};

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
  private readonly restored = new Map<string, z.infer<typeof encounterSnapshotSchema>>();
  private readonly visited = new Set<ForestRegionId>();
  private readonly discovered = new Set<string>();
  private savedAt = 0;
  private journalPreferences: JournalPreferences = { mode: 'explore', pinned: null };
  public saveAvailable = true;

  /** Inventory/equipment remain available while the traveler is resting in town. */
  get supplies(): AdventureSession {
    return this.current;
  }

  constructor(private readonly options: JourneyOptions = {}) {
    const saved = snapshotSchema.safeParse(options.snapshot);
    this.story =
      options.scenarioProgress ?? new ScenarioProgress(saved.success ? saved.data.story : []);
    if (saved.success) {
      this.journalPreferences = saved.data.journal ?? { mode: 'explore', pinned: null };
      this.traveler = saved.data.traveler;
      for (const id of saved.data.visited) this.visited.add(id);
      for (const id of saved.data.discovered) this.discovered.add(id);
      for (const area of saved.data.areas) this.restored.set(area.id, area.state);
    }
    this.encounterLevel = options.enemyLevelOverride;
    this.camp = new AdventureSession(
      { enemies: [], flowers: [], water: [] },
      [],
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0 },
      undefined,
      { ...options, scenarioProgress: this.story, canUseSupplies: false },
    );
    this.current = this.camp;
    if (this.traveler) this.camp.arrive(this.traveler, { x: 0, y: 0 });
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
      const saved = this.restored.get(id);
      if (saved) {
        area.restoreEncounters(saved);
        this.restored.delete(id);
      }
    }
    area.arrive(this.traveler, arrival);
    this.current = area;
    this.checkpoint(true);
    return area;
  }

  leave(rest = false): void {
    if (rest) this.current.rest();
    this.traveler = this.current.traveler();
    this.current.suspend();
    this.camp.arrive(this.traveler, { x: 0, y: 0 });
    this.current = this.camp;
    this.checkpoint(true);
  }

  visit(id: ForestRegionId): void {
    this.visited.add(id);
  }
  discover(id: string): boolean {
    if (this.discovered.has(id)) return false;
    this.discovered.add(id);
    this.checkpoint(true);
    return true;
  }
  exploration(): { visited: ForestRegionId[]; discovered: string[] } {
    return { visited: [...this.visited], discovered: [...this.discovered] };
  }
  snapshot(): JourneySnapshot {
    return {
      version: 1,
      traveler: {
        ...this.current.traveler(),
        inventory: this.current.getInventory(),
        provisions: this.current.provisions.snapshot(),
        spellCooldowns: { ...this.current.spellCooldowns },
      },
      story: this.story.snapshot(),
      journal: { ...this.journalPreferences },
      ...this.exploration(),
      areas: [...this.restored]
        .map(([id, state]) => ({ id, state }))
        .concat(
          [...this.areas].map(([id, session]) => ({ id, state: session.encounterSnapshot() })),
        ),
    };
  }
  journal(sample: RpgSample, samples: readonly RpgSample[]): JourneyJournal {
    const journal = buildJournal(sample, samples, {
      ...this.journalPreferences,
      ...this.exploration(),
      facts: this.story.snapshot(),
      saveAvailable: this.saveAvailable,
    });
    if (journal.pinned && journal.pinned !== journal.objective?.id) {
      this.setJournal({ pinned: null });
      journal.pinned = null;
    }
    return journal;
  }
  setJournal(preferences: Partial<JournalPreferences>): void {
    this.journalPreferences = { ...this.journalPreferences, ...preferences };
    this.checkpoint(true);
  }
  checkpoint(force = false): void {
    if (!this.options.persist || (!force && Date.now() - this.savedAt < 5000)) return;
    this.savedAt = Date.now();
    this.saveAvailable = this.options.persist(this.snapshot()) !== false;
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
