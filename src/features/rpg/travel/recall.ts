/** A single-use transition latch. It never uses wall timers or consumes inventory. */
export class TownRecall {
  private age: number | null = null;
  private delivered = false;
  static readonly durationMs = 1400;
  get active(): boolean {
    return this.age !== null;
  }
  get progress(): number {
    return Math.min(1, (this.age ?? 0) / TownRecall.durationMs);
  }
  start(): boolean {
    if (this.active) return false;
    this.age = 0;
    this.delivered = false;
    return true;
  }
  advance(dt: number): boolean {
    if (this.age === null || !Number.isFinite(dt) || dt < 0) return false;
    this.age += dt;
    if (this.age < TownRecall.durationMs || this.delivered) return false;
    this.delivered = true;
    return true;
  }
  reset(): void {
    this.age = null;
    this.delivered = false;
  }
}
