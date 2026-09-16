import * as Phaser from 'phaser';
import { SLIME_PALETTES } from './slime-assets';
import type { SlimeVariant } from './types';

const rgb = (color: readonly number[]) => `vec3(${color.map((n) => `${n}.0`).join(', ')}) / 255.0`;

/** Swap only the two body colors, before Phaser applies combat tints and opacity. */
export function applySlimePalette(
  sprite: Phaser.GameObjects.Image,
  variant: SlimeVariant = 'pink',
) {
  if (variant === 'pink') {
    sprite.setRenderNodeRole('BatchHandler', null);
    return;
  }
  const renderer = sprite.scene.sys.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;

  const manager = renderer.renderNodes;
  const name = `momo-slime-${variant}`;
  let node = manager.getNode(name);
  if (!node) {
    const batch = new Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad(manager, {
      name,
      instancesPerBatch: 64,
    });
    const palette = SLIME_PALETTES[variant];
    const source = SLIME_PALETTES.pink;
    batch.programManager.addAddition(
      {
        name,
        additions: {
          fragmentProcess: `
            if (distance(fragColor.rgb, ${rgb(source.body)}) < 0.002) {
              fragColor.rgb = ${rgb(palette.body)};
            } else if (distance(fragColor.rgb, ${rgb(source.shadow)}) < 0.002) {
              fragColor.rgb = ${rgb(palette.shadow)};
            }
          `,
        },
      },
      batch.programManager.getAdditionIndex('Tint'),
    );
    // One shared node per palette. Phaser owns cleanup and context restoration.
    manager.addNode(name, batch);
    node = batch;
  }
  sprite.setRenderNodeRole('BatchHandler', node);
}
