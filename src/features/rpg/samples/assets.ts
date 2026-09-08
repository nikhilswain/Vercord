import type { Rect } from '../../world/engine/types';
import type { RpgTexture } from '../types';

const ASSETS = '/game-assets/lpc-world/';
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

export const RPG_TEXTURES: RpgTexture[] = [
  { key: 'lpc-terrain', url: `${ASSETS}terrain-summer.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-flowers', url: `${ASSETS}flowers.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-walls', url: `${ASSETS}jagged-walls.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-stone-floor', url: `${ASSETS}stone-floor.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-diamond-floor', url: `${ASSETS}diamond-floor.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-grit', url: `${ASSETS}gritty-dirt.png`, frameWidth: 32, frameHeight: 32 },
  { key: 'lpc-house-hall', url: `${ASSETS}brick-house-a.png` },
  { key: 'lpc-house-brick', url: `${ASSETS}brick-house-b.png` },
  { key: 'lpc-house-paneled', url: `${ASSETS}paneled-house-a.png` },
  {
    key: 'lpc-trees',
    url: `${ASSETS}trees-summer.png`,
    frames: {
      oak: rect(128, 16, 96, 112),
      oldOak: rect(224, 16, 96, 112),
      tallOak: rect(320, 16, 96, 128),
      pine: rect(224, 384, 96, 128),
    },
  },
  {
    key: 'lpc-rocks',
    url: `${ASSETS}rocks.png`,
    frames: {
      large: rect(0, 0, 64, 96),
      medium: rect(64, 64, 64, 32),
      small: rect(128, 64, 32, 32),
    },
  },
  {
    key: 'lpc-bridge',
    url: `${ASSETS}wood-bridge.png`,
    frames: {
      deck: rect(32, 96, 32, 80),
      left: rect(0, 96, 32, 80),
      right: rect(64, 96, 32, 80),
    },
  },
  {
    key: 'lpc-pillar',
    url: `${ASSETS}stone-pillars.png`,
    frames: {
      slate: rect(192, 0, 32, 96),
      pale: rect(96, 0, 32, 96),
      broken: rect(192, 288, 32, 96),
    },
  },
  { key: 'lpc-sign', url: `${ASSETS}signs.png`, frames: { oak: rect(0, 0, 32, 32) } },
  { key: 'lpc-arch', url: `${ASSETS}arched-doorway.png`, frames: { stone: rect(0, 96, 160, 96) } },
  { key: 'lpc-stairs', url: `${ASSETS}cement-stairs.png`, frames: { down: rect(0, 64, 32, 32) } },
  {
    key: 'lpc-chest',
    url: `${ASSETS}chests.png`,
    frames: {
      bronze: rect(0, 0, 32, 32),
      iron: rect(96, 0, 32, 32),
    },
  },
  { key: 'lpc-shelf', url: `${ASSETS}shelves.png`, frames: { low: rect(0, 0, 96, 32) } },
  { key: 'lpc-torch', url: `${ASSETS}wall-lights.png`, frames: { flame: rect(64, 16, 32, 48) } },
  {
    key: 'lpc-dungeon-details',
    url: `${ASSETS}dungeon-elements.png`,
    frames: {
      ivy: rect(0, 0, 32, 64),
      web: rect(32, 0, 32, 64),
      coins: rect(0, 96, 32, 32),
    },
  },
  { key: 'lpc-door-small', url: `${ASSETS}door-48.png`, frames: { closed: rect(224, 16, 32, 48) } },
  { key: 'lpc-door-tall', url: `${ASSETS}door-64.png`, frames: { closed: rect(224, 32, 32, 64) } },
];
