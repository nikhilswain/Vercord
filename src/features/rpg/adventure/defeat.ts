/** A defeat is terminal for this visit. Rendering and the return callback have one clock. */
export const DEFEAT_RETURN_MS = 3200;
export class DefeatSequence {
  elapsed: number | null = null;
  private returned = false;
  get active(): boolean {
    return this.elapsed !== null;
  }
  start(): boolean {
    if (this.active) return false;
    this.elapsed = 0;
    this.returned = false;
    return true;
  }
  advance(dt: number): boolean {
    if (this.elapsed === null || this.returned) return false;
    this.elapsed = Math.min(DEFEAT_RETURN_MS, this.elapsed + Math.max(0, Math.min(50, dt)));
    if (this.elapsed < DEFEAT_RETURN_MS) return false;
    this.returned = true;
    return true;
  }
  reset(): void {
    this.elapsed = null;
    this.returned = false;
  }
}
