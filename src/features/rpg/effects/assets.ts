import type Phaser from 'phaser';

const effect = (file: string, size: number, frames: number, duration: number) => ({
  key: `action-fx:${file}`,
  url: `/game-assets/action-fx/${file}.png`,
  size,
  frames,
  duration,
});

/** Original, attributed sheets. One frame clock, no per-frame object creation. */
export const ACTION_FX = {
  slash: effect('slash', 64, 10, 280),
  swing: effect('swing', 64, 10, 280),
  impact: effect('impact', 64, 10, 260),
  healing: effect('healing', 100, 91, 1400),
  battle: effect('battle', 100, 46, 1200),
  swiftstep: effect('swiftstep', 100, 73, 1200),
} as const;

export function preloadActionEffects(scene: Phaser.Scene): void {
  for (const asset of Object.values(ACTION_FX))
    if (!scene.textures.exists(asset.key))
      scene.load.spritesheet(asset.key, asset.url, {
        frameWidth: asset.size,
        frameHeight: asset.size,
      });
}

export function actionEffectFrame(
  id: keyof typeof ACTION_FX,
  elapsed: number,
  reducedMotion: boolean,
): number {
  const asset = ACTION_FX[id];
  return Math.min(
    asset.frames - 1,
    Math.floor((reducedMotion ? 0.25 : Math.max(0, elapsed) / asset.duration) * asset.frames),
  );
}
