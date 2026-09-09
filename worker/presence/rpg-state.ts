import { z } from 'zod';
import {
  rpgAdmissionSchema,
  rpgAppearanceSchema,
  rpgLocationSchema,
  type RpgLocation,
} from '../../src/domain/presence/rpg-protocol';
import type { WorldDocument } from '../../src/domain/world/document';
import type { HouseInterior } from '../../src/domain/world/interiors';
import { isHouseSceneId, type RpgSceneId } from '../../src/domain/world/catalog/scenes';
import { worldThemeIdSchema, type WorldBindings } from '../../src/domain/world/protocol';
import { WorldAccessError } from '../live-world/coordinator';
import { RpgCollisionMap } from './rpg-geometry';
import { appearanceFitsTheme, getWorldTheme } from '../../src/domain/world/catalog/themes';

export { appearanceFitsTheme } from '../../src/domain/world/catalog/themes';

export const rpgPartitionSchema = rpgAdmissionSchema.extend({
  theme: worldThemeIdSchema,
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const rpgSocketSchema = rpgPartitionSchema.extend({
  ...rpgLocationSchema.shape,
  appearance: rpgAppearanceSchema,
  appearanceUpdatedAt: z.number().int().nonnegative().optional(),
  budget: z.number().finite().min(0).max(96),
  budgetAt: z.number().int().nonnegative(),
});
export type RpgPartition = z.infer<typeof rpgPartitionSchema>;
export type RpgSocket = z.infer<typeof rpgSocketSchema>;
export function readRpgPartition(params: URLSearchParams): RpgPartition | null | undefined {
  if (params.size === 0) return undefined;
  if (params.size !== 4 || [...params.keys()].some((key) => params.getAll(key).length !== 1))
    return null;
  const parsed = rpgPartitionSchema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : null;
}
const progressSchema = rpgLocationSchema.pick({ x: true, y: true, direction: true }).extend({
  updatedAt: z.number().int().nonnegative(),
});
type Progress = z.infer<typeof progressSchema>;
const savedAppearanceSchema = z.strictObject({
  appearance: rpgAppearanceSchema,
  updatedAt: z.number().int().nonnegative(),
});
type SavedAppearance = z.infer<typeof savedAppearanceSchema>;
type SavedProgress = Progress | SavedAppearance;
type Geometry = {
  collisions: Map<RpgSceneId, RpgCollisionMap>;
  rooms: Map<string, { id: string; x: number; y: number; radius: number }>;
};
const SAVE_INTERVAL = 2_000;
const SPEED = 240;
const BUDGET = 96;
const MAX_CACHED_PROGRESS = 1_024;
const MAX_CACHED_HOUSES = 256;

export function rpgPartitionKey(partition: RpgPartition): string {
  return `${partition.worldId}:${partition.checksum}:${partition.scene}`;
}
export function sameRpgPartition(first: RpgPartition, second: RpgPartition): boolean {
  return first.theme === second.theme && rpgPartitionKey(first) === rpgPartitionKey(second);
}

/** Geometry stays server-owned; socket attachments and saved progress contain only small state. */
export class RpgPresenceState {
  private readonly geometries = new Map<string, Geometry>();
  private readonly pending = new Map<string, SavedProgress>();
  private readonly latest = new Map<string, SavedProgress | undefined>();
  private readonly lanes = new Map<string, Promise<unknown>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private finishTimer: (() => void) | null = null;
  private writes = Promise.resolve();

  public constructor(
    private readonly storage: DurableObjectStorage,
    private readonly waitUntil: (job: Promise<void>) => void,
  ) {}

  public register(saved: {
    document: WorldDocument;
    checksum: string;
    bindings: WorldBindings;
    interior?: HouseInterior;
  }): void {
    const key = `${saved.document.worldId}:${saved.checksum}`;
    for (const existing of this.geometries.keys())
      if (existing.startsWith(`${saved.document.worldId}:`) && existing !== key)
        this.geometries.delete(existing);
    const previous = this.geometries.get(key);
    const rooms = previous?.rooms ?? new Map();
    const landmarks = new Map(
      saved.document.scenes.overworld.landmarks.map((landmark) => [landmark.id, landmark]),
    );
    for (const binding of saved.bindings) {
      const landmark = landmarks.get(binding.landmarkId);
      if (landmark) for (const room of binding.rooms) rooms.set(room.key, landmark);
    }
    const collisions =
      previous?.collisions ??
      new Map<RpgSceneId, RpgCollisionMap>([
        ['overworld', new RpgCollisionMap(saved.document.scenes.overworld)],
        ['dungeon', new RpgCollisionMap(saved.document.scenes.dungeon)],
      ]);
    if (saved.interior && isHouseSceneId(saved.interior.landmarkId)) {
      const id = saved.interior.landmarkId;
      const existing = collisions.get(id);
      collisions.delete(id);
      collisions.set(id, existing ?? new RpgCollisionMap(saved.interior.scene));
      while (collisions.size > MAX_CACHED_HOUSES + 2) {
        const oldest = [...collisions.keys()].find(isHouseSceneId);
        if (oldest) collisions.delete(oldest);
      }
    }
    this.geometries.set(key, { collisions, rooms });
  }

  public has(partition: RpgPartition): boolean {
    return (
      this.geometries
        .get(`${partition.worldId}:${partition.checksum}`)
        ?.collisions.has(partition.scene) ?? false
    );
  }

  public restore(partition: RpgPartition, userId: string, now: number): Promise<RpgSocket> {
    return this.ordered(partition, userId, async () => {
      const collision = this.collision(partition);
      const positionKey = this.positionKey(partition, userId);
      const appearanceKey = this.appearanceKey(partition, userId);
      const saved = await this.hydrate([positionKey, appearanceKey]);
      const progress = progressSchema.safeParse(saved.get(positionKey));
      const parsedAppearance = savedAppearanceSchema.safeParse(saved.get(appearanceKey));
      const location =
        progress.success && collision.safe(progress.data)
          ? progress.data
          : { ...collision.scene.spawn, direction: 'down' as const };
      if (isHouseSceneId(partition.scene)) await this.anchorHouseReturn(partition, userId, now);
      return {
        ...partition,
        x: location.x,
        y: location.y,
        direction: location.direction,
        action: 'idle',
        appearance:
          parsedAppearance.success &&
          appearanceFitsTheme(parsedAppearance.data.appearance, partition.theme)
            ? parsedAppearance.data.appearance
            : getWorldTheme(partition.theme).defaultAppearance,
        appearanceUpdatedAt: parsedAppearance.success ? parsedAppearance.data.updatedAt : 0,
        budget: BUDGET,
        budgetAt: now,
      };
    });
  }

  public move(
    previous: RpgSocket,
    location: RpgLocation,
    now: number,
  ): { accepted: boolean; next: RpgSocket } {
    const budget = Math.min(
      BUDGET,
      previous.budget + (Math.max(0, now - previous.budgetAt) * SPEED) / 1_000,
    );
    const next = { ...previous, budget, budgetAt: now };
    const collision = this.collision(previous);
    const distance = Math.hypot(location.x - previous.x, location.y - previous.y);
    if (
      location.scene !== previous.scene ||
      !Number.isFinite(distance) ||
      distance > budget + 0.01 ||
      !collision.safe(location) ||
      !collision.sweptClear(previous, location)
    ) {
      return { accepted: false, next: { ...next, action: 'idle' } };
    }
    return {
      accepted: true,
      next: {
        ...next,
        x: location.x,
        y: location.y,
        direction: location.direction,
        action: location.action,
        budget: Math.max(0, budget - distance),
      },
    };
  }

  public canUseRoom(partition: RpgSocket, roomKey: string): boolean {
    const landmark = this.geometry(partition).rooms.get(roomKey);
    if (isHouseSceneId(partition.scene)) return landmark?.id === partition.scene;
    if (partition.scene !== 'overworld') return false;
    return (
      landmark !== undefined &&
      Math.hypot(partition.x - landmark.x, partition.y - landmark.y) <= landmark.radius + 24
    );
  }

  /** Bindings identify geometry; only the caller's current authorized room keys grant access. */
  public canOccupyScene(partition: RpgPartition, roomKeys: Iterable<string>): boolean {
    if (!isHouseSceneId(partition.scene)) return true;
    const geometry = this.geometries.get(`${partition.worldId}:${partition.checksum}`);
    if (!geometry) return false;
    for (const roomKey of roomKeys)
      if (geometry.rooms.get(roomKey)?.id === partition.scene) return true;
    return false;
  }

  public save(userId: string, state: RpgSocket, now: number, immediate = false): Promise<void> {
    return this.ordered(state, userId, async () => {
      const key = this.positionKey(state, userId);
      const appearanceKey = this.appearanceKey(state, userId);
      // A close can be the first event after hibernation. Hydrate before comparing versions.
      const saved = await this.hydrate([key, appearanceKey]);
      const old = saved.get(key);
      if (old === undefined || old.updatedAt <= now) {
        const progress = { x: state.x, y: state.y, direction: state.direction, updatedAt: now };
        this.remember(key, progress);
        this.pending.set(key, progress);
      }
      const oldAppearance = saved.get(appearanceKey);
      const appearanceUpdatedAt = state.appearanceUpdatedAt ?? 0;
      // Profile selection has its own world-wide version; movement/close times cannot advance it.
      if (oldAppearance === undefined || appearanceUpdatedAt > oldAppearance.updatedAt) {
        const appearance = { appearance: state.appearance, updatedAt: appearanceUpdatedAt };
        this.remember(appearanceKey, appearance);
        this.pending.set(appearanceKey, appearance);
      }
      if (immediate) return this.flush([key, appearanceKey]);
      if (this.pending.size > 0 && this.timer === null) {
        const waiting = new Promise<void>((resolve) => {
          this.finishTimer = resolve;
        });
        this.waitUntil(waiting);
        this.timer = setTimeout(() => {
          this.timer = null;
          const finish = this.finishTimer;
          this.finishTimer = null;
          this.waitUntil(this.flush().finally(() => finish?.()));
        }, SAVE_INTERVAL);
      }
    });
  }

  public flush(keys = [...this.pending.keys()]): Promise<void> {
    const values: Array<[string, SavedProgress]> = [];
    for (const key of keys) {
      const value = this.pending.get(key);
      if (value !== undefined) values.push([key, value]);
      this.pending.delete(key);
    }
    if (this.pending.size === 0) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.finishTimer?.();
      this.finishTimer = null;
    }
    if (values.length === 0) return this.writes;
    this.writes = this.writes
      .catch(() => undefined)
      .then(async () => {
        // Durable Object storage accepts at most 128 values in one put.
        for (let index = 0; index < values.length; index += 128)
          await this.storage.put(Object.fromEntries(values.slice(index, index + 128)));
      });
    return this.writes;
  }

  private geometry(partition: RpgPartition): Geometry {
    const geometry = this.geometries.get(`${partition.worldId}:${partition.checksum}`);
    if (!geometry) throw new WorldAccessError();
    return geometry;
  }
  private collision(partition: RpgPartition): RpgCollisionMap {
    const collisions = this.geometry(partition).collisions;
    const collision = collisions.get(partition.scene);
    if (!collision) throw new WorldAccessError();
    if (isHouseSceneId(partition.scene)) {
      collisions.delete(partition.scene);
      collisions.set(partition.scene, collision);
    }
    return collision;
  }
  /** Runs inside the member's restore lane, before admission's final authorization check. */
  private async anchorHouseReturn(
    partition: RpgPartition,
    userId: string,
    now: number,
  ): Promise<void> {
    const door = [...this.geometry(partition).rooms.values()].find(
      (room) => room.id === partition.scene,
    );
    const outside = { ...partition, scene: 'overworld' as const };
    const collision = this.collision(outside);
    if (!door || !collision.safe(door)) throw new WorldAccessError();
    const key = this.positionKey(outside, userId);
    const saved = await this.hydrate([key]);
    const old = progressSchema.safeParse(saved.get(key));
    const nearby =
      old.success &&
      collision.safe(old.data) &&
      Math.hypot(old.data.x - door.x, old.data.y - door.y) <= door.radius + 24;
    const position = nearby ? old.data : { x: door.x, y: door.y, direction: 'down' as const };
    const progress: Progress = {
      x: position.x,
      y: position.y,
      direction: position.direction,
      // Old outdoor sockets close with their last movement time, even if closing much later.
      updatedAt: Math.max(now + 1, (old.success ? old.data.updatedAt : 0) + 1),
    };
    this.remember(key, progress);
    this.pending.set(key, progress);
    await this.flush([key]);
  }
  private async hydrate(keys: string[]): Promise<Map<string, SavedProgress | undefined>> {
    const result = new Map<string, SavedProgress | undefined>();
    const missing: string[] = [];
    for (const key of keys) {
      if (this.latest.has(key) || this.pending.has(key)) {
        const value = this.pending.get(key) ?? this.latest.get(key);
        result.set(key, value);
        this.remember(key, value);
      } else missing.push(key);
    }
    if (missing.length) {
      // Evicted cache entries may still be in an in-flight batch. Read after that batch commits.
      await this.writes;
      const durable = await this.storage.get<unknown>(missing);
      for (const key of missing) {
        const raw = durable.get(key);
        const parsed = key.startsWith('rpgAppearance:')
          ? savedAppearanceSchema.safeParse(
              typeof raw === 'string' ? { appearance: raw, updatedAt: 0 } : raw,
            )
          : progressSchema.safeParse(raw);
        const value = parsed.success ? parsed.data : undefined;
        result.set(key, value);
        this.remember(key, value);
      }
    }
    return result;
  }

  private remember(key: string, value: SavedProgress | undefined): void {
    this.latest.delete(key);
    this.latest.set(key, value);
    while (this.latest.size > MAX_CACHED_PROGRESS) {
      const oldest = this.latest.keys().next().value;
      if (oldest !== undefined) this.latest.delete(oldest);
    }
  }

  private ordered<T>(
    partition: RpgPartition,
    userId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${partition.worldId}:${userId}`;
    const previous = this.lanes.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.lanes.set(key, current);
    void current
      .finally(() => {
        if (this.lanes.get(key) === current) this.lanes.delete(key);
      })
      .catch(() => undefined);
    return current;
  }
  private positionKey(partition: RpgPartition, userId: string): string {
    return `rpgProgress:${partition.worldId}:${userId}:${partition.scene}`;
  }
  private appearanceKey(partition: RpgPartition, userId: string): string {
    return `rpgAppearance:${partition.worldId}:${userId}`;
  }
}
