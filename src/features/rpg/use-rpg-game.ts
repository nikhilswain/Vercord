import { useEffect, useRef, useState } from 'react';
import { RpgGame } from './rpg-game';
import type { Point } from '../world/engine/types';
import type { RpgLocation, RpgPresencePlayer } from '../../domain/presence/rpg-protocol';
import type { RpgDestination, RpgDialogue, RpgRuntime, RpgSample, RpgUiState } from './types';

interface Options {
  sample: RpgSample;
  samples: readonly RpgSample[];
  worldKey: string;
  appearance: string;
  blocked: boolean;
  players?: readonly RpgPresencePlayer[];
  playerPosition?: RpgLocation | null;
  onUi(state: RpgUiState): void;
  onDialogue(dialogue: RpgDialogue): void;
  onTravel(destination: RpgDestination): void;
  onStreet?(street: string): void;
  onMove?(location: RpgLocation): void;
  onHouse?(landmarkId: string): void;
}

let previousTeardown: Promise<void> = Promise.resolve();
const NO_PLAYERS: readonly RpgPresencePlayer[] = [];

/** Owns the React/Phaser boundary, including Strict Mode, sizing and retry cleanup. */
export function useRpgGame(options: Options) {
  const {
    sample,
    samples,
    worldKey,
    appearance,
    blocked,
    players = NO_PLAYERS,
    playerPosition = null,
    onUi,
    onDialogue,
    onTravel,
    onStreet,
    onMove,
    onHouse,
  } = options;
  const sceneKey = `${worldKey}/${sample.id}`;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<RpgRuntime | null>(null);
  const settings = useRef({
    sample,
    samples,
    sceneKey,
    appearance,
    blocked,
    players,
    playerPosition,
  });
  const callbacks = useRef({ onUi, onDialogue, onTravel, onStreet, onMove, onHouse });
  const positions = useRef(new Map<string, Point>());
  const [attempt, setAttempt] = useState(0);
  const runtimeKey = `${worldKey}:${attempt}`;
  const [state, setState] = useState<{ key: string; status: 'ready' | 'error' } | null>(null);
  const status = state?.key === runtimeKey ? state.status : 'loading';
  const inputBlocked = blocked || status !== 'ready';

  useEffect(() => {
    settings.current = {
      sample,
      samples,
      sceneKey,
      appearance,
      blocked: inputBlocked,
      players,
      playerPosition,
    };
    callbacks.current = { onUi, onDialogue, onTravel, onStreet, onMove, onHouse };
  }, [
    sample,
    samples,
    sceneKey,
    appearance,
    inputBlocked,
    players,
    playerPosition,
    onUi,
    onDialogue,
    onTravel,
    onStreet,
    onMove,
    onHouse,
  ]);
  useEffect(() => runtimeRef.current?.setScene(sample, sceneKey), [sample, sceneKey]);
  useEffect(() => runtimeRef.current?.setAppearance(appearance), [appearance]);
  useEffect(() => runtimeRef.current?.setPlayers(players), [players, sceneKey]);
  useEffect(() => {
    if (playerPosition) runtimeRef.current?.setPlayerPosition(playerPosition);
  }, [playerPosition]);
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
          onStreet: (next) => active && callbacks.current.onStreet?.(next),
          onMove: (location) => active && callbacks.current.onMove?.(location),
          get onHouse() {
            return callbacks.current.onHouse
              ? (id: string) => active && callbacks.current.onHouse?.(id)
              : undefined;
          },
        },
        current.samples,
        current.sceneKey,
        positions.current,
      );
      runtimeRef.current = runtime;
      runtime.setAppearance(settings.current.appearance);
      runtime.setPlayers(settings.current.players);
      if (settings.current.playerPosition)
        runtime.setPlayerPosition(settings.current.playerPosition);
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
