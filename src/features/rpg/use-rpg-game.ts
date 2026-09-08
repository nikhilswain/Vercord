import { useEffect, useRef, useState } from 'react';
import { RpgGame } from './rpg-game';
import type { Point } from '../world/engine/types';
import type { RpgDestination, RpgDialogue, RpgRuntime, RpgSample, RpgUiState } from './types';

interface Options {
  sample: RpgSample;
  samples: readonly RpgSample[];
  worldKey: string;
  appearance: string;
  blocked: boolean;
  onUi(state: RpgUiState): void;
  onDialogue(dialogue: RpgDialogue): void;
  onTravel(destination: RpgDestination): void;
}

let previousTeardown: Promise<void> = Promise.resolve();

/** Owns the React/Phaser boundary, including Strict Mode, sizing and retry cleanup. */
export function useRpgGame(options: Options) {
  const { sample, samples, worldKey, appearance, blocked, onUi, onDialogue, onTravel } = options;
  const sceneKey = `${worldKey}/${sample.id}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RpgRuntime | null>(null);
  const settings = useRef({ sample, samples, sceneKey, appearance, blocked });
  const callbacks = useRef({ onUi, onDialogue, onTravel });
  const positions = useRef(new Map<string, Point>());
  const [attempt, setAttempt] = useState(0);
  const runtimeKey = `${worldKey}:${attempt}`;
  const [state, setState] = useState<{ key: string; status: 'ready' | 'error' } | null>(null);
  const status = state?.key === runtimeKey ? state.status : 'loading';
  const inputBlocked = blocked || status !== 'ready';

  useEffect(() => {
    settings.current = { sample, samples, sceneKey, appearance, blocked: inputBlocked };
    callbacks.current = { onUi, onDialogue, onTravel };
  }, [sample, samples, sceneKey, appearance, inputBlocked, onUi, onDialogue, onTravel]);
  useEffect(() => runtimeRef.current?.setScene(sample, sceneKey), [sample, sceneKey]);
  useEffect(() => runtimeRef.current?.setAppearance(appearance), [appearance]);
  useEffect(() => runtimeRef.current?.setInputBlocked(inputBlocked), [inputBlocked]);

  useEffect(() => {
    let active = true;
    let observer: ResizeObserver | undefined;
    let runtime: RpgGame | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // The first Strict Mode effect is cancelled before allocating a WebGL context.
    void previousTeardown.then(() => {
      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!active || !canvas || !host) return;
      const updateStatus = (next: 'ready' | 'error') => {
        clearTimeout(timeout);
        if (active) setState({ key: runtimeKey, status: next });
      };
      const current = settings.current;
      runtime = new RpgGame(
        canvas,
        current.sample,
        {
          onReady: () => updateStatus('ready'),
          onError: () => updateStatus('error'),
          onUi: (state) => active && callbacks.current.onUi(state),
          onDialogue: (dialogue) => active && callbacks.current.onDialogue(dialogue),
          onTravel: (next) => active && callbacks.current.onTravel(next),
        },
        current.samples,
        current.sceneKey,
        positions.current,
      );
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
      if (runtime) previousTeardown = Promise.resolve(runtime.destroy());
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [runtimeKey]);

  return {
    hostRef,
    canvasRef,
    runtimeRef,
    canvasKey: runtimeKey,
    status,
    retry: () => {
      setAttempt((value) => value + 1);
    },
  };
}
