const REVALIDATE_AFTER_MS = 10_000;
const CHANGE_COALESCE_MS = 500;
const MAX_BACKOFF_MS = 60_000;

export type ChannelRefreshReason = 'change' | 'reconnect' | 'focus';
export type ChannelRefreshResult = boolean | { retryAfterMs: number };
export interface ChannelRefreshStatus {
  retryAt: number;
  pending: boolean;
}

/** Event-driven reads only: no idle polling and no self-retrying failure loop. */
export class ChannelRefreshController {
  private pending: Promise<boolean> | null = null;
  private trailingExplicit: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private stopped = false;
  private lastSuccess = -Infinity;
  private lastAttempt = -Infinity;
  private retryAt = 0;
  private failures = 0;

  public constructor(
    private readonly read: () => Promise<ChannelRefreshResult>,
    private readonly isVisible: () => boolean,
    private readonly onStatusChange?: (status: ChannelRefreshStatus) => void,
  ) {}

  /** Explicit reads include opening the manager and reconciling a completed mutation. */
  public refresh(): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.pending) {
      // A mutation may have completed after the in-flight read began. Read once more,
      // and make all explicit callers await that same fresh result.
      this.trailingExplicit ??= this.pending.then(() => {
        this.trailingExplicit = null;
        return this.refresh();
      });
      return this.trailingExplicit;
    }
    if (Date.now() < this.retryAt) {
      // Opening the manager during cooldown must not drop an already queued change.
      if (this.dirty) this.schedule();
      return Promise.resolve(false);
    }
    this.clearTimer();
    return this.run();
  }

  public notify(reason: ChannelRefreshReason): void {
    if (this.stopped) return;
    if (reason === 'change') this.dirty = true;
    if (!this.isVisible()) return;
    // A welcome/focus immediately after loading is not a channel change.
    if (!this.dirty && Date.now() - this.lastSuccess < REVALIDATE_AFTER_MS) return;
    if (this.pending || this.trailingExplicit) return;
    this.schedule();
  }

  public dispose(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(): void {
    if (this.stopped || this.timer !== undefined || !this.isVisible()) return;
    const delay = Math.max(
      CHANGE_COALESCE_MS,
      this.retryAt - Date.now(),
      this.lastAttempt + CHANGE_COALESCE_MS - Date.now(),
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.stopped && this.isVisible()) void this.run();
    }, delay);
  }

  private run(): Promise<boolean> {
    if (this.pending) return this.pending;
    this.dirty = false;
    this.lastAttempt = Date.now();
    this.onStatusChange?.({ retryAt: this.retryAt, pending: true });
    this.pending = Promise.resolve()
      .then(() => (this.stopped ? false : this.read()))
      .catch(() => false)
      .then((result) => {
        const success = result === true;
        if (success) {
          this.lastSuccess = Date.now();
          this.failures = 0;
          this.retryAt = 0;
        } else {
          this.failures += 1;
          const backoff = Math.min(5_000 * 2 ** Math.min(this.failures - 1, 4), MAX_BACKOFF_MS);
          const providerDelay = typeof result === 'object' ? result.retryAfterMs : 0;
          this.retryAt = Date.now() + Math.max(backoff, providerDelay);
        }
        return success;
      })
      .finally(() => {
        this.pending = null;
        if (!this.stopped) this.onStatusChange?.({ retryAt: this.retryAt, pending: false });
        // Only an actual change received during the read schedules another read.
        if (this.dirty && !this.trailingExplicit) this.schedule();
      });
    return this.pending;
  }
}
