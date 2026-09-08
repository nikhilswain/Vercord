import { useEffect, useRef, useState } from 'react';
import { RpgGame } from './rpg-game';
import type { RpgDestination, RpgDialogue, RpgRuntime, RpgThemeId, RpgUiState } from './types';

interface Options {
  theme: RpgThemeId;
  appearance: string;
  blocked: boolean;
  onUi(state: RpgUiState): void;
  onDialogue(dialogue: RpgDialogue): void;
  onTravel(destination: RpgDestination): void;
}

/** Owns the React/Phaser boundary, including Strict Mode, sizing and retry cleanup. */
export function useRpgGame(options: Options) {
  const { theme, appearance, blocked, onUi, onDialogue, onTravel } = options;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RpgRuntime | null>(null);
  const settings = useRef({ theme, appearance, blocked });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    settings.current = { theme, appearance, blocked };
  }, [theme, appearance, blocked]);
  useEffect(() => runtimeRef.current?.setTheme(theme), [theme]);
  useEffect(() => runtimeRef.current?.setAppearance(appearance), [appearance]);
  useEffect(() => runtimeRef.current?.setInputBlocked(blocked), [blocked]);

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    let runtime: RpgRuntime | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // The first Strict Mode effect is cancelled before allocating a WebGL context.
    queueMicrotask(() => {
      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!active || !canvas || !host) return;
      const updateStatus = (next: 'ready' | 'error') => {
        clearTimeout(timeout);
        if (active) setStatus(next);
      };
      runtime = new RpgGame(canvas, settings.current.theme, {
        onReady: () => updateStatus('ready'),
        onError: () => updateStatus('error'),
        onUi: (state) => active && onUi(state),
        onDialogue: (dialogue) => active && onDialogue(dialogue),
        onTravel: (next) => active && onTravel(next),
      });
      runtimeRef.current = runtime;
      runtime.setAppearance(settings.current.appearance);
      runtime.setInputBlocked(settings.current.blocked);
      const resize = () => {
        const bounds = host.getBoundingClientRect();
        runtime?.resize(Math.round(bounds.width), Math.round(bounds.height));
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      timeout = setTimeout(() => updateStatus('error'), 25_000);
      runtime.start();
    });
    return () => {
      active = false;
      clearTimeout(timeout);
      observer?.disconnect();
      runtime?.destroy();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [attempt, onUi, onDialogue, onTravel]);

  return {
    hostRef,
    canvasRef,
    runtimeRef,
    attempt,
    status,
    retry: () => {
      setStatus('loading');
      setAttempt((value) => value + 1);
    },
  };
}
