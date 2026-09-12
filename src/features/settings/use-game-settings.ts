import { useSyncExternalStore } from 'react';
import {
  backgroundVolume,
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_KEY,
  parseGameSettings,
  type GameSettings,
} from './game-settings';

let snapshot: GameSettings | undefined;
const listeners = new Set<() => void>();

function read(): GameSettings {
  try {
    return parseGameSettings(window.localStorage.getItem(GAME_SETTINGS_KEY));
  } catch {
    return snapshot ?? DEFAULT_GAME_SETTINGS;
  }
}

function getSnapshot() {
  return (snapshot ??= read());
}

function onStorage(event: StorageEvent) {
  if (event.key !== GAME_SETTINGS_KEY && event.key !== null) return;
  snapshot = read();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  // Pick up changes made while no game settings subscriber was mounted.
  snapshot = read();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}

export function setBackgroundVolume(volume: number) {
  snapshot = {
    ...getSnapshot(),
    audio: { ...getSnapshot().audio, backgroundVolume: backgroundVolume(volume) },
  };
  try {
    window.localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(snapshot));
  } catch {
    /* Restricted storage still permits settings for this visit. */
  }
  for (const listener of listeners) listener();
}

export function useGameSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_GAME_SETTINGS);
}
