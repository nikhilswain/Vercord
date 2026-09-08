import { StrictMode, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RpgCallbacks } from '../../../src/features/rpg/types';

const games = vi.hoisted(() => ({
  instances: [] as Array<{ started: boolean; destroyed: boolean; release(): void }>,
}));
vi.mock('../../../src/features/rpg/rpg-game', () => ({
  RpgGame: class {
    started = false;
    destroyed = false;
    release = () => {};
    constructor(
      _canvas: unknown,
      _sample: unknown,
      private callbacks: RpgCallbacks,
    ) {
      games.instances.push(this);
    }
    start() {
      this.started = true;
      this.callbacks.onReady();
    }
    destroy() {
      this.destroyed = true;
      return new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
    setScene() {}
    setAppearance() {}
    setInputBlocked() {}
    resize() {}
  },
}));
import { getRpgSample, RPG_SAMPLES } from '../../../src/features/rpg/sample-worlds';
import { useRpgGame } from '../../../src/features/rpg/use-rpg-game';

const samples = Object.values(RPG_SAMPLES);
const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

beforeEach(() => {
  games.instances.length = 0;
});

describe('RPG renderer lifecycle', () => {
  it('keeps one runtime across callback changes and waits for graphics teardown before replacing it', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ worldKey, callback }) => {
        const game = useRpgGame({
          sample: getRpgSample('village'),
          samples,
          worldKey,
          appearance: 'rowan',
          blocked: false,
          onUi: callback,
          onDialogue: callback,
          onTravel: callback,
        });
        game.hostRef.current = document.createElement('div');
        game.canvasRef.current = document.createElement('canvas');
        return game;
      },
      { wrapper, initialProps: { worldKey: 'first', callback: vi.fn() } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(games.instances).toHaveLength(1);
    rerender({ worldKey: 'first', callback: vi.fn() });
    await act(async () => {});
    expect(games.instances).toHaveLength(1);
    rerender({ worldKey: 'second', callback: vi.fn() });
    await act(async () => {});
    expect(games.instances[0]?.destroyed).toBe(true);
    expect(games.instances).toHaveLength(1);
    await act(async () => {
      games.instances[0]!.release();
    });
    await waitFor(() => expect(games.instances).toHaveLength(2));
    expect(result.current.status).toBe('ready');
    unmount();
    await act(async () => {
      games.instances[1]!.release();
    });
  });
});
