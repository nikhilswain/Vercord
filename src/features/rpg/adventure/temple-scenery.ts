import type { RpgSample } from '../types';
import { TEMPLE_FLAME_ANIMATION, TEMPLE_TEXTURES } from './temple-assets';
import { at, block } from '../../../domain/world/content/v1/builder';

/** The asset adapter owns visual placement. Encounters and navigation remain ordinary content. */
export function templeObject(
  sample: RpgSample,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  sample.stamps.push({
    texture: `temple-${name}`,
    ...at(x, y),
    width: w * 2,
    height: h * 2,
    originX: 0.5,
    originY: 1,
    depth: y * 32,
  });
}

export function addTempleScenery(sample: RpgSample, sanctuary: boolean): void {
  sample.textures = [...sample.textures, ...TEMPLE_TEXTURES];
  // Preserve each trunk's feet/collider while swapping the canopy to the matching pack.
  for (const stamp of sample.stamps) {
    if (stamp.texture !== 'lpc-trees') continue;
    const footY = stamp.depth ?? stamp.y + 112;
    const variant = Math.floor(stamp.x / 32 + footY / 32) % 3;
    Object.assign(stamp, {
      texture: `temple-tree-${variant === 0 ? 'pine' : variant === 1 ? 'broad' : 'round'}`,
      frame: undefined,
      x: stamp.x + 48,
      y: footY + 6,
      originX: 0.5,
      originY: 1,
      width: 128,
      height: 160,
    });
  }
  if (!sanctuary) {
    templeObject(sample, 'foundation', 41, 7, 160, 80);
    block(sample, 37.4, 5.6, 7.8, 1);
    for (const [x, y] of [
      [34, 13],
      [44, 16],
      [40, 22],
    ] as const) {
      templeObject(sample, 'broken-column', x, y, 32, 32);
      block(sample, x - 0.5, y - 0.5, 1, 0.5);
    }
    templeObject(sample, 'broken-statue', 46, 7, 64, 104);
    block(sample, 45.3, 6.3, 1.4, 0.7);
    return;
  }

  // Connected, weathered stone paving: open lanes on both sides of the central arena.
  for (const [left, top, width, height] of [
    [13, 11, 19, 11],
    [17, 9, 11, 3],
    [17, 22, 12, 5],
    [12, 27, 22, 3],
  ] as const)
    for (let y = top; y < top + height; y++)
      for (let x = left; x < left + width; x++) {
        const edge = x === left || x === left + width - 1 || y === top || y === top + height - 1;
        if (edge && (x * 7 + y * 13) % 5 === 0) continue;
        sample.stamps.push({
          texture: 'temple-flagstone',
          ...at(x, y),
          width: 32,
          height: 32,
          depth: -45,
          tint: (x * 3 + y * 7) % 11 === 0 ? 0xc5ceac : 0xffffff,
        });
      }
  templeObject(sample, 'sanctuary', 22, 10, 144, 144);
  block(sample, 17.5, 6.5, 9, 3);
  for (const [x, y, broken] of [
    [11, 13, false],
    [34, 13, true],
    [11, 22, true],
    [34, 22, false],
  ] as const) {
    templeObject(sample, broken ? 'broken-statue' : 'statue', x, y, 64, 104);
    block(sample, x - 0.7, y - 0.8, 1.4, 0.8);
  }
  for (const [x, y] of [
    [13, 17],
    [32, 17],
    [16, 27],
    [29, 27],
    [18, 32],
    [27, 32],
  ] as const) {
    templeObject(sample, (x + y) % 2 ? 'broken-column' : 'column', x, y, 32, 32);
    block(sample, x - 0.5, y - 0.5, 1, 0.5);
  }
  for (const [x, y] of [
    [11, 10],
    [31, 10],
    [10, 26],
    [31, 26],
  ] as const) {
    templeObject(sample, 'wall', x, y, 64, 32);
    block(sample, x - 2, y - 0.8, 4, 0.8);
  }
  for (const [x, y] of [
    [14, 24],
    [31, 31],
    [28, 11],
  ] as const) {
    templeObject(sample, 'rubble', x, y, 48, 48);
    block(sample, x - 0.8, y - 0.8, 1.6, 0.7);
  }
  templeObject(sample, 'urns', 19, 11, 32, 32);
  block(sample, 18.5, 10.5, 1, 0.5);
  // Native flame frames on the shared scenery clock. No per-flame timers or rebaking.
  sample.animatedScenery = [
    [16, 11],
    [29, 11],
    [18, 31],
    [27, 31],
  ].map(([x, y], i) => ({
    texture: 'temple-flame',
    ...at(x!, y!),
    width: 48,
    height: 60,
    originX: 0.5,
    originY: 0.8,
    depth: y! * 32 + 1,
    ...TEMPLE_FLAME_ANIMATION,
    phaseMs: i * 190,
  }));
  sample.signage!.push({
    ...at(22, 5),
    text: 'The Rootbound sanctuary',
    detail: 'Root Beast territory',
    kind: 'place',
    maxWidth: 230,
  });
}
