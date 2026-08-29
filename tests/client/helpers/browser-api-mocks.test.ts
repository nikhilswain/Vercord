import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  flushAnimationFrames,
  installBrowserApiMocks,
  resetBrowserApiMocks,
  setBrowserMediaState,
  setElementRect,
  triggerResize,
} from './browser-api-mocks';

describe('browser API mocks', () => {
  beforeEach(() => {
    installBrowserApiMocks();
    resetBrowserApiMocks();
  });

  it('isolates pointer capture by element and pointer id', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.setPointerCapture(7);
    expect(first.hasPointerCapture(7)).toBe(true);
    expect(second.hasPointerCapture(7)).toBe(false);
    first.releasePointerCapture(7);
    expect(first.hasPointerCapture(7)).toBe(false);
  });

  it('reports configured bounds to only the observing ResizeObserver', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const firstObserver = new ResizeObserver(firstCallback);
    const secondObserver = new ResizeObserver(secondCallback);
    firstObserver.observe(first);
    secondObserver.observe(second);

    setElementRect(first, { x: 4, y: 8, width: 320, height: 240 });
    expect(first.getBoundingClientRect()).toMatchObject({
      x: 4,
      y: 8,
      width: 320,
      height: 240,
    });
    expect(first.clientWidth).toBe(320);
    triggerResize(first, 640, 480);
    expect(firstCallback).toHaveBeenCalledTimes(1);
    expect(secondCallback).not.toHaveBeenCalled();
  });

  it('updates coarse pointer and reduced motion independently', () => {
    const coarse = matchMedia('(any-pointer: coarse)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const coarseListener = vi.fn();
    coarse.addEventListener('change', coarseListener);

    setBrowserMediaState({ anyCoarsePointer: true });
    expect(coarse.matches).toBe(true);
    expect(reduced.matches).toBe(false);
    expect(coarseListener).toHaveBeenCalledTimes(1);
    setBrowserMediaState({ reducedMotion: true });
    expect(reduced.matches).toBe(true);
  });

  it('flushes active animation frames and omits cancelled frames', () => {
    const active = vi.fn();
    const cancelled = vi.fn();
    requestAnimationFrame(active);
    const cancelledId = requestAnimationFrame(cancelled);
    cancelAnimationFrame(cancelledId);
    flushAnimationFrames(32);
    expect(active).toHaveBeenCalledWith(32);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
