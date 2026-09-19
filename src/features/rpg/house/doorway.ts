import type { RpgSample, RpgStamp, RpgTexture } from '../types';

const trim: RpgTexture = {
  key: 'house-doorway-trim',
  url: '/game-assets/house-trim/doorway.svg',
  frames: {
    doorway: { x: 0, y: 0, width: 96, height: 48 },
    beam: { x: 96, y: 0, width: 32, height: 16 },
  },
};

/** Correct the cutaway edge of already-saved rooms without rewriting their geometry. */
export function presentDoorway(scene: RpgSample): RpgSample {
  const threshold = scene.stamps.find(
    (s) => s.texture === 'house-v1-furniture' && s.frame === 'threshold',
  );
  const floor = scene.stamps.find(
    (s) => s.depth === -100 && (s.texture === 'house-v2-floor' || s.frame === 'floor'),
  );
  if (!threshold || !floor) return scene;
  const edgeY = scene.bounds.height - 32;
  const left = threshold.x,
    right = left + 96;
  const oldEdge = (s: RpgStamp) =>
    s.texture === 'house-v1-furniture' && s.frame === 'floor' && s.y === edgeY;
  const edgeTint = scene.stamps.find(oldEdge)?.tint;
  const stamps = scene.stamps.filter((s) => s !== threshold && !oldEdge(s));
  // Continue the actual floor through the opening, removing the black notch.
  for (let x = left; x < right; x += 32)
    stamps.push({ ...floor, x, y: edgeY, width: 32, height: 16, depth: -80 });
  // Clip the final segment to the jamb; the doorway is not necessarily on the tile grid.
  for (const [start, end] of [
    [32, left],
    [right, scene.bounds.width - 32],
  ])
    for (let x = start!; x < end!; x += 32)
      stamps.push({
        texture: trim.key,
        frame: 'beam',
        x,
        y: edgeY,
        width: Math.min(32, end! - x),
        height: 16,
        depth: scene.bounds.height - 8,
        ...(edgeTint !== undefined ? { tint: edgeTint } : {}),
      });
  stamps.push({ texture: trim.key, frame: 'doorway', x: left, y: edgeY - 32, depth: -75 });
  return { ...scene, textures: [...scene.textures, trim], stamps };
}
