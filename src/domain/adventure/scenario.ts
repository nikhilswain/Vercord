import type { Point, Rect } from '../world/content/v1/types';
import type { ItemStack } from './inventory';

export interface StoryCondition {
  requires?: readonly string[];
  unless?: readonly string[];
}
export interface StoryDialogue {
  closeLabel?: string;
  name: string;
  role: string;
  lines: string[];
}
export interface StoryInteraction extends Point, StoryCondition {
  /** A solid actor's world footprint. Sight lines end just outside its near edge. */
  body?: Rect;
  id: string;
  label: string;
  action: 'Talk' | 'Read' | 'Open' | 'Use';
  radius?: number;
  grant?: readonly string[];
  herbs?: number;
  items?: readonly ItemStack[];
  removeItems?: readonly ItemStack[];
  /** Let an in-world casting effect finish before its explanatory dialogue pauses the game. */
  presentation?: { durationMs: number; pose: 'cast' };
  dialogue: StoryDialogue;
  locked?: StoryDialogue;
  repeat?: StoryDialogue;
}
export interface ScenarioDefinition {
  title: string;
  /** Area admission is checked by the shared journey before replacing the current session. */
  entry?: StoryCondition & { blocked: StoryDialogue };
  objectives: Array<StoryCondition & { text: string; complete?: boolean }>;
  interactions: StoryInteraction[];
  gates?: Array<
    StoryCondition & { id: string; bounds: Rect; openingFlag: string; duration: number }
  >;
  hazards?: Array<StoryCondition & Point & { id: string; radius: number; damage: number }>;
  defeats?: Array<{ enemyId: string; flag: string }>;
}

/** Serializable, idempotent story facts shared by an expedition's areas. No renderer or demo policy. */
export class ScenarioProgress {
  private readonly facts: Set<string>;
  constructor(saved: readonly string[] = []) {
    this.facts = new Set(saved);
  }
  has(flag: string): boolean {
    return this.facts.has(flag);
  }
  grant(flag: string): boolean {
    if (this.facts.has(flag)) return false;
    this.facts.add(flag);
    return true;
  }
  snapshot(): string[] {
    return [...this.facts].sort();
  }
  matches(condition: StoryCondition): boolean {
    return (
      (condition.requires ?? []).every((flag) => this.has(flag)) &&
      !(condition.unless ?? []).some((flag) => this.has(flag))
    );
  }
}

/** Interaction transactions, objective selection and gate timing are independent of their art. */
export class ScenarioSession {
  time = 0;
  private readonly changedAt = new Map<string, number>();
  private blockers: Rect[] = [];
  private gateSignature = '';
  collisionRevision = 0;
  constructor(
    readonly definition: ScenarioDefinition,
    readonly progress: ScenarioProgress,
  ) {
    this.updateGates();
  }
  tick(dt: number, defeated: readonly { id: string; health: number }[]): void {
    this.time += dt;
    for (const trigger of this.definition.defeats ?? [])
      if (defeated.some((enemy) => enemy.id === trigger.enemyId && enemy.health === 0))
        this.grant(trigger.flag);
    this.updateGates();
  }
  matches(condition: StoryCondition): boolean {
    return this.progress.matches(condition);
  }
  grant(flag: string): void {
    if (this.progress.grant(flag)) this.changedAt.set(flag, this.time);
  }
  age(flag: string): number {
    if (!this.progress.has(flag)) return 0;
    const at = this.changedAt.get(flag);
    return at === undefined ? Infinity : this.time - at;
  }
  get colliders(): readonly Rect[] {
    return this.blockers;
  }
  objective(): { title: string; text: string; complete: boolean } {
    const objective = this.definition.objectives.find((entry) => this.matches(entry));
    return {
      title: this.definition.title,
      text: objective?.text ?? '',
      complete: Boolean(objective?.complete),
    };
  }
  nearby(player: Point, clearLine: (point: Point) => boolean): StoryInteraction | null {
    let nearest: StoryInteraction | null = null;
    let distance = Infinity;
    for (const interaction of this.definition.interactions) {
      // Locked mechanisms remain inspectable and explain the missing requirement.
      if (!this.matches(interaction) && !interaction.locked) continue;
      const next = Math.hypot(player.x - interaction.x, player.y - interaction.y);
      const body = interaction.body;
      const approach = body
        ? {
            x: Math.max(body.x - 1, Math.min(body.x + body.width + 1, player.x)),
            y: Math.max(body.y - 1, Math.min(body.y + body.height + 1, player.y)),
          }
        : interaction;
      if (next > (interaction.radius ?? 58) || next >= distance || !clearLine(approach)) continue;
      nearest = interaction;
      distance = next;
    }
    return nearest;
  }
  interact(interaction: StoryInteraction): {
    dialogue: StoryDialogue;
    herbs: number;
    items?: readonly ItemStack[];
    removeItems?: readonly ItemStack[];
  } {
    if (!this.definition.interactions.includes(interaction))
      throw new Error('Unknown story interaction');
    if (!this.matches(interaction))
      return { dialogue: interaction.locked ?? interaction.dialogue, herbs: 0 };
    const alreadyUsed =
      Boolean(interaction.grant?.length) &&
      interaction.grant!.every((flag) => this.progress.has(flag));
    if (alreadyUsed) return { dialogue: interaction.repeat ?? interaction.dialogue, herbs: 0 };
    for (const flag of interaction.grant ?? []) this.grant(flag);
    this.updateGates();
    return {
      dialogue: interaction.dialogue,
      herbs: interaction.grant?.length ? (interaction.herbs ?? 0) : 0,
      ...(interaction.grant?.length && interaction.items ? { items: interaction.items } : {}),
      ...(interaction.grant?.length && interaction.removeItems
        ? { removeItems: interaction.removeItems }
        : {}),
    };
  }
  private updateGates(): void {
    const closed = (this.definition.gates ?? []).filter(
      (gate) =>
        this.matches(gate) &&
        (!this.progress.has(gate.openingFlag) || this.age(gate.openingFlag) < gate.duration),
    );
    const signature = closed.map((gate) => gate.id).join('|');
    if (signature === this.gateSignature) return;
    this.gateSignature = signature;
    this.blockers = closed.map((gate) => gate.bounds);
    this.collisionRevision++;
  }
}
