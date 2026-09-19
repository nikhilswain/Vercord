import type { Point, Rect } from '../../../domain/world/content/v1/types';
import type { RpgStamp, RpgTexture } from '../types';

export const FOREST_PORTAL_TEXTURES: RpgTexture[] = [
  { key: 'forest-waygate-arch', url: '/game-assets/ruined-temple/arch.png' },
  { key: 'forest-waygate-circle', url: '/game-assets/waygate/circle.svg' },
];

/** Overgrown temple arch + a low stone rune circle, with walkable space in front.
 * Presentation only: published arrival coordinates and server collision remain unchanged.
 */
export function forestPortalArt(point: Point, scale = 1): RpgStamp[] {
  const stamps: RpgStamp[] = [
    {
      texture: 'forest-waygate-circle',
      x: point.x - 96,
      y: point.y - 68,
      width: 192,
      height: 112,
      depth: -10,
    },
    {
      texture: 'forest-waygate-arch',
      x: point.x - 112,
      y: point.y - 140,
      width: 224,
      height: 128,
      depth: point.y - 16,
    },
  ];
  return scale === 1
    ? stamps
    : stamps.map((s) => ({
        ...s,
        x: point.x + (s.x - point.x) * scale,
        y: point.y + (s.y - point.y) * scale,
        width: s.width! * scale,
        height: s.height! * scale,
        depth: s.depth! < 0 ? s.depth : point.y + (s.depth! - point.y) * scale,
      }));
}

/** Older sample towns use baked ground tiles instead of the continuous terrain renderer. */
export function trailGround(roads: Rect[]): RpgStamp[] {
  const tiles = new Set<string>();
  for (const road of roads)
    for (let y = Math.floor(road.y / 32); y < Math.ceil((road.y + road.height) / 32); y++)
      for (let x = Math.floor(road.x / 32); x < Math.ceil((road.x + road.width) / 32); x++)
        tiles.add(`${x}:${y}`);
  return [...tiles].map((key) => {
    const [x, y] = key.split(':').map(Number) as [number, number];
    return { texture: 'lpc-terrain', frame: 68, x: x * 32, y: y * 32, depth: -15 };
  });
}
