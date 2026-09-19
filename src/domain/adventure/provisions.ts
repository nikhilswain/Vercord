import { z } from 'zod';
import {
  getItem,
  itemCount,
  takeItem,
  type InventorySnapshot,
  type ItemId,
  type UseItemResult,
} from './inventory';

export const BASE_MAX_HEALTH = 100;
import { SWIFTSTEP_MULTIPLIER } from './movement';
const remaining = z.number().finite().min(0).max(1800).catch(0);
const effectSchema = z.object({ id: z.string(), remaining }).nullable().catch(null);
export const provisionsSchema = z
  .object({
    version: z.literal(1),
    buff: effectSchema,
    meal: effectSchema,
    recoveryCooldown: remaining,
    mealCooldown: remaining,
    useCooldown: remaining,
    combatRemaining: remaining,
    recovery: z.enum(['healing-herb', 'healing-bottle']).catch('healing-herb'),
    quickBuff: z.enum(['battle-bottle', 'swiftstep-bottle']).catch('battle-bottle'),
    learned: z.array(z.string().max(64)).max(20).catch([]),
    projects: z.array(z.string().max(96)).max(32).catch([]),
    trackedRecipe: z.string().max(64).nullable().catch(null),
    crafted: z.array(z.string().max(64)).max(20).catch([]),
    actions: z.array(z.string().max(96)).max(128).catch([]),
  })
  .catch({
    version: 1,
    buff: null,
    meal: null,
    recoveryCooldown: 0,
    mealCooldown: 0,
    useCooldown: 0,
    combatRemaining: 0,
    recovery: 'healing-herb',
    quickBuff: 'battle-bottle',
    learned: [],
    projects: [],
    trackedRecipe: null,
    crafted: [],
    actions: [],
  });
export type ProvisionsSnapshot = z.infer<typeof provisionsSchema>;
export interface PendingUse {
  id: ItemId;
  remaining: number;
  duration: number;
  x: number;
  y: number;
}
export function derivedStats(state: ProvisionsSnapshot) {
  const meal = state.meal && state.meal.remaining > 0 ? getItem(state.meal.id) : undefined;
  const buff = state.buff && state.buff.remaining > 0 ? getItem(state.buff.id) : undefined;
  return {
    maxHealth: Math.round(BASE_MAX_HEALTH * (1 + (meal?.vitality ?? 0))),
    damage: buff?.benefit === 'battle' ? 1.2 : 1,
    movement: buff?.benefit === 'swiftstep' ? SWIFTSTEP_MULTIPLIER : 1,
  };
}
export function sanitizeProvisions(value: unknown): ProvisionsSnapshot {
  const parsed = structuredClone(provisionsSchema.parse(value));
  if (parsed.meal && getItem(parsed.meal.id)?.benefit !== 'meal') parsed.meal = null;
  if (parsed.buff && !['battle', 'swiftstep'].includes(getItem(parsed.buff.id)?.benefit ?? ''))
    parsed.buff = null;
  for (const slot of ['meal', 'buff'] as const) {
    const effect = parsed[slot];
    if (effect) {
      effect.remaining = Math.min(effect.remaining, getItem(effect.id)!.duration!);
      if (effect.remaining === 0) parsed[slot] = null;
    }
  }
  return parsed;
}
/** Remaining durations, not resettable map clocks. The journey owns this state.
 * Offline time is paused; UI panels tick it while the world remains connected. */
export class Provisions {
  state: ProvisionsSnapshot;
  pending: PendingUse | null = null;
  constructor(saved?: unknown) {
    this.state = sanitizeProvisions(saved);
  }
  snapshot(): ProvisionsSnapshot {
    return structuredClone(this.state);
  }
  get stats() {
    return derivedStats(this.state);
  }
  combat(): void {
    this.state.combatRemaining = 10;
    this.pending = null;
  }
  cancel(): void {
    this.pending = null;
  }
  defeat(): void {
    this.state.buff = null;
    this.cancel();
  }
  check(id: string, inventory: InventorySnapshot, health: number): UseItemResult | null {
    const item = getItem(id);
    if (!item || !itemCount(inventory, id)) return { success: false, reason: 'missing' };
    if (item.requiresCooking) return { success: false, reason: 'cooking' };
    if (!item.heal && !item.healFraction && !item.benefit)
      return { success: false, reason: 'not-consumable' };
    if (health <= 0 || this.pending) return { success: false, reason: 'busy' };
    if (!item.plainFood && this.state.useCooldown > 0)
      return { success: false, reason: 'cooldown' };
    if (item.benefit === 'meal' || item.plainFood) {
      if (this.state.combatRemaining > 0) return { success: false, reason: 'combat' };
    }
    if (item.benefit === 'meal') {
      if (this.state.meal) return { success: false, reason: 'meal-active' };
      if (this.state.mealCooldown > 0) return { success: false, reason: 'cooldown' };
    } else if (item.benefit) {
      if (this.state.buff?.id === id && this.state.buff.remaining > 0)
        return { success: false, reason: 'already-active' };
    } else {
      if (health >= this.stats.maxHealth) return { success: false, reason: 'full-health' };
      if (!item.plainFood && this.state.recoveryCooldown > 0)
        return { success: false, reason: 'cooldown' };
    }
    return null;
  }
  begin(
    id: string,
    inventory: InventorySnapshot,
    health: number,
    point: { x: number; y: number },
  ): UseItemResult {
    const error = this.check(id, inventory, health);
    if (error) return error;
    const item = getItem(id)!;
    const duration = item.benefit === 'meal' || item.plainFood ? 4 : 0.6;
    this.pending = { id: id as ItemId, remaining: duration, duration, ...point };
    return { success: true, pending: true, inventory, health, restored: 0 };
  }
  tick(
    dt: number,
    point: { x: number; y: number },
    inventory: InventorySnapshot,
    health: number,
  ): { inventory: InventorySnapshot; health: number; used?: ItemId; canceled?: boolean } {
    dt = Math.max(0, Math.min(1, dt));
    for (const key of [
      'recoveryCooldown',
      'mealCooldown',
      'useCooldown',
      'combatRemaining',
    ] as const)
      this.state[key] = Math.max(0, this.state[key] - dt);
    for (const key of ['buff', 'meal'] as const) {
      const effect = this.state[key];
      if (effect) {
        effect.remaining = Math.max(0, effect.remaining - dt);
        if (!effect.remaining) this.state[key] = null;
      }
    }
    health = Math.min(health, this.stats.maxHealth);
    const pending = this.pending;
    if (!pending) return { inventory, health };
    if (Math.hypot(point.x - pending.x, point.y - pending.y) > 2 || health <= 0) {
      this.cancel();
      return { inventory, health, canceled: true };
    }
    pending.remaining -= dt;
    if (pending.remaining > 0) return { inventory, health };
    this.cancel();
    // Revalidate at completion. A canceled, depleted or invalid action spends nothing.
    if (this.check(pending.id, inventory, health)) return { inventory, health, canceled: true };
    const item = getItem(pending.id)!;
    const next = takeItem(inventory, pending.id, 1);
    if (!next) return { inventory, health, canceled: true };
    if (item.benefit === 'meal') {
      this.state.meal = { id: pending.id, remaining: item.duration! };
      this.state.mealCooldown = 60;
    } else if (item.benefit) this.state.buff = { id: pending.id, remaining: item.duration! };
    else if (!item.plainFood) this.state.recoveryCooldown = 20;
    const maxHealth = this.stats.maxHealth;
    health = Math.min(
      maxHealth,
      health + (item.healFraction ? Math.round(item.healFraction * maxHealth) : (item.heal ?? 0)),
    );
    if (!item.plainFood) this.state.useCooldown = 3;
    return { inventory: next, health, used: pending.id };
  }
}
export const USE_ITEM_MESSAGES = {
  missing: 'None left. Gather supplies along the trail.',
  cooking: 'Cook this at a camp hearth.',
  'not-consumable': 'This is an ingredient or a story item.',
  'full-health': 'Health is full. Your supply was kept.',
  cooldown: 'Wait for your supply cooldown.',
  busy: 'Finish your current action first.',
  combat: 'Leave combat for 10 seconds before eating.',
  'already-active': 'This bottle effect is already active.',
  'meal-active': 'Your meal is still active. Broth can restore HP without replacing it.',
  'adventure-only': 'Use food and bottles in adventure. Prepare them here for the trail.',
} as const;
