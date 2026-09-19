import { HOUSE_TEXTURE } from '../house-v1/assets';
import type { RpgTexture } from '../v1/types';

const frame = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const texture = (name: string, frames: RpgTexture['frames']): RpgTexture => ({
  key: `house-v2-${name}`,
  url: `/game-assets/house-v2/${name}.png`,
  frames,
});

/** Pinned LPC originals; all crops are runtime frame selections, never modified source art. */
export const HOUSE_V2_TEXTURES = [
  HOUSE_TEXTURE,
  texture('floor', {
    oak: frame(32, 32, 32, 32),
    walnut: frame(32, 64, 32, 32),
    ash: frame(32, 160, 32, 32),
  }),
  texture('fireplace', {
    stone: frame(0, 96, 96, 96),
    carved: frame(0, 0, 96, 96),
    brick: frame(96, 0, 96, 96),
  }),
  texture(
    'fire',
    Object.fromEntries([0, 1, 2].map((i) => [`fire${i}`, frame(i * 32, 64, 32, 36)])),
  ),
  texture(
    'clock',
    Object.fromEntries([0, 1, 2].map((i) => [`clock${i}`, frame(i * 32, 0, 32, 96)])),
  ),
  texture(
    'cauldron',
    Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`pot${i}`, frame(0, i * 32, 32, 32)])),
  ),
  texture('table', {
    dark: frame(0, 0, 96, 64),
    oak: frame(0, 64, 96, 64),
    round: frame(96, 0, 32, 64),
  }),
  texture('desk', { dark: frame(0, 0, 96, 64), ink: frame(0, 64, 64, 64) }),
  texture('bed', {
    moss: frame(384, 0, 64, 96),
    amber: frame(0, 0, 64, 96),
    blue: frame(256, 0, 64, 96),
  }),
  texture('plants', {
    fern: frame(0, 32, 32, 64),
    tree: frame(32, 0, 32, 96),
    flowers: frame(64, 0, 32, 96),
    vase: frame(96, 32, 32, 64),
    palm: frame(128, 32, 32, 64),
  }),
  texture('chair', {
    moss: frame(0, 96, 32, 32),
    amber: frame(0, 0, 32, 32),
    blue: frame(0, 64, 32, 32),
  }),
  texture('workbench', { bench: frame(0, 0, 96, 64) }),
  texture('wheel', {
    base: frame(0, 0, 64, 64),
    ...Object.fromEntries([1, 2, 3, 4].map((i) => [`wheel${i}`, frame(i * 64, 0, 64, 64)])),
  }),
  texture('clutter', {
    tea: frame(0, 0, 32, 32),
    herbs: frame(32, 64, 32, 32),
    bottles: frame(128, 64, 32, 32),
    basket: frame(32, 96, 32, 32),
  }),
  texture('candles', { candle: frame(128, 0, 32, 32), lantern: frame(128, 32, 32, 32) }),
  texture('paper', { notes: frame(32, 32, 32, 32), letters: frame(64, 64, 32, 32) }),
] as const;

export const HOUSE_V2_ASSETS = new Map(HOUSE_V2_TEXTURES.map((asset) => [asset.key, asset]));
