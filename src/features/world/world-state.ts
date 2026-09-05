import type {
  ChannelMutationResult,
  WorldSync,
  WorldView,
  WorldViewVersion,
} from '../../domain/channels/protocol';
import { ChannelApiError } from './channel-api';

export type WorldClientState = {
  view: WorldView | null;
  sync: WorldSync;
  pending: boolean;
  retryAt: number;
  uncertainRequestId: string | null;
  /** True only after an explicit read has reconciled an uncertain mutation. */
  canConfirmReconciled: boolean;
};

const INITIAL_SYNC: WorldSync = { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' };

export function compareWorldVersion(left: WorldViewVersion, right: WorldViewVersion): number {
  return left.epoch === right.epoch
    ? left.revision - right.revision
    : left.epoch - right.epoch;
}

function sameGeometry(left: WorldView, right: WorldView): boolean {
  return (
    JSON.stringify([left.snapshot.server, left.snapshot.areas]) ===
    JSON.stringify([right.snapshot.server, right.snapshot.areas])
  );
}

function sameSync(left: WorldSync, right: WorldSync): boolean {
  if (left.state !== right.state) return false;
  if (left.state === 'ready') return true;
  if (left.state === 'cooldown' && right.state === 'cooldown') {
    return (
      left.code === right.code && left.scope === right.scope && left.retryAt === right.retryAt
    );
  }
  return right.state !== 'ready' && right.state !== 'cooldown' && left.code === right.code;
}

function failureSync(error: unknown): WorldSync {
  if (!(error instanceof ChannelApiError)) {
    return { state: 'recovering', code: 'WORLD_SOURCE_UNAVAILABLE' };
  }
  if (error.code === 'UNAUTHENTICATED' || error.code === 'GUILD_MEMBERSHIP_REQUIRED') {
    return { state: 'denied', code: error.code };
  }
  if (error.retryAt > Date.now()) {
    return {
      state: 'cooldown',
      scope: error.scope ?? 'admission',
      retryAt: error.retryAt,
      code: error.code,
    };
  }
  if (error.code === 'GATEWAY_UPDATE_REQUIRED' || error.code === 'WORLD_SOURCE_UNAVAILABLE') {
    return { state: 'offline', code: error.code };
  }
  return { state: 'recovering', code: error.code };
}

export class WorldStateStore {
  private snapshot: WorldClientState = {
    view: null,
    sync: INITIAL_SYNC,
    pending: false,
    retryAt: 0,
    uncertainRequestId: null,
    canConfirmReconciled: false,
  };
  private readonly listeners = new Set<() => void>();
  private pendingRead: Promise<boolean> | null = null;
  private readController: AbortController | null = null;
  private statusGeneration = 0;
  private disposed = false;

  public constructor(private readonly read: (signal: AbortSignal) => Promise<WorldView>) {}

  public readonly getSnapshot = (): WorldClientState => {
    return this.snapshot;
  };

  public readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public refresh(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pendingRead !== null) return this.pendingRead;
    if (Date.now() < this.snapshot.retryAt) return Promise.resolve(false);

    const controller = new AbortController();
    const generation = this.statusGeneration;
    this.readController = controller;
    this.update({ ...this.snapshot, pending: true });

    const request = this.read(controller.signal)
      .then((view) => {
        if (
          this.disposed ||
          controller.signal.aborted ||
          this.readController !== controller ||
          this.statusGeneration !== generation
        ) {
          return false;
        }
        this.accept(view);
        this.update({
          ...this.snapshot,
          sync: { state: 'ready' },
          retryAt: 0,
          canConfirmReconciled: this.snapshot.uncertainRequestId !== null,
        });
        return true;
      })
      .catch((error: unknown) => {
        if (
          this.disposed ||
          controller.signal.aborted ||
          this.readController !== controller ||
          this.statusGeneration !== generation
        ) {
          return false;
        }
        const sync = failureSync(error);
        this.update({
          ...this.snapshot,
          sync,
          retryAt: sync.state === 'cooldown' ? sync.retryAt : this.snapshot.retryAt,
          canConfirmReconciled: false,
        });
        return false;
      })
      .finally(() => {
        if (this.readController === controller) {
          this.readController = null;
          this.pendingRead = null;
        }
        if (!this.disposed) this.update({ ...this.snapshot, pending: false });
      });
    this.pendingRead = request;
    return request;
  }

  public accept(view: WorldView): void {
    if (this.disposed) return;
    const comparison = this.snapshot.view
      ? compareWorldVersion(view.version, this.snapshot.view.version)
      : 1;
    if (comparison < 0) return;
    if (comparison > 0) this.applyView(view);

    const activeCooldown =
      this.snapshot.sync.state === 'cooldown' && this.snapshot.retryAt > Date.now();
    if (!activeCooldown && this.snapshot.sync.state !== 'ready') {
      this.update({ ...this.snapshot, sync: { state: 'ready' }, retryAt: 0 });
    }
  }

  public status(sync: WorldSync): void {
    if (this.disposed) return;
    if (sync.state !== 'ready') {
      this.statusGeneration += 1;
    }
    const retryAt =
      sync.state === 'cooldown'
        ? sync.retryAt
        : sync.state === 'ready'
          ? 0
          : this.snapshot.retryAt;
    const nextSync = sameSync(sync, this.snapshot.sync) ? this.snapshot.sync : sync;
    this.update({
      ...this.snapshot,
      sync: nextSync,
      retryAt,
      canConfirmReconciled:
        sync.state === 'ready' ? this.snapshot.canConfirmReconciled : false,
    });
  }

  public mutation(result: ChannelMutationResult): void {
    if (this.disposed) return;
    if (result.status === 'applied') {
      if (result.view !== null) this.accept(result.view);
      return;
    }
    if (result.status === 'uncertain') {
      this.update({
        ...this.snapshot,
        uncertainRequestId: result.requestId,
        canConfirmReconciled: false,
      });
      return;
    }
    if (result.code === 'UNAUTHENTICATED' || result.code === 'GUILD_MEMBERSHIP_REQUIRED') {
      this.status({ state: 'denied', code: result.code });
      return;
    }
    if (result.code === 'WORLD_NOT_FOUND') {
      this.status({ state: 'recovering', code: result.code });
      return;
    }
    if (result.code === 'GATEWAY_UPDATE_REQUIRED' || result.code === 'WORLD_SOURCE_UNAVAILABLE') {
      this.status({ state: 'offline', code: result.code });
      return;
    }
    if (result.retryAt !== undefined) {
      this.status({
        state: 'cooldown',
        scope: 'mutation',
        retryAt: result.retryAt,
        code: result.code,
      });
    }
  }

  public confirmReconciled(): void {
    if (
      this.disposed ||
      this.snapshot.uncertainRequestId === null ||
      !this.snapshot.canConfirmReconciled
    ) {
      return;
    }
    this.update({
      ...this.snapshot,
      uncertainRequestId: null,
      canConfirmReconciled: false,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.readController?.abort();
    this.readController = null;
    this.pendingRead = null;
    this.listeners.clear();
  }

  private applyView(view: WorldView): void {
    const current = this.snapshot.view;
    const accepted =
      current !== null && sameGeometry(current, view)
        ? { ...view, snapshot: current.snapshot }
        : view;
    this.update({ ...this.snapshot, view: accepted });
  }

  private update(next: WorldClientState): void {
    if (
      next.view === this.snapshot.view &&
      next.sync === this.snapshot.sync &&
      next.pending === this.snapshot.pending &&
      next.retryAt === this.snapshot.retryAt &&
      next.uncertainRequestId === this.snapshot.uncertainRequestId &&
      next.canConfirmReconciled === this.snapshot.canConfirmReconciled
    ) {
      return;
    }
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
}
