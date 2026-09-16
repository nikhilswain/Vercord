import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getRpgCharacter,
  RPG_CHARACTER_DEFINITIONS,
  RPG_CHARACTER_LAYERS,
} from '../../../src/domain/world/catalog/characters';
import { WORLD_THEMES } from '../../../src/domain/world/catalog/themes';
import { rpgAppearanceSchema } from '../../../src/domain/presence/rpg-protocol';
import { RpgPortrait } from '../../../src/features/rpg/RpgPortrait';

describe('shared traveler appearances', () => {
  it('offers complete outfits per theme and preserves saved appearance IDs', () => {
    expect(new Set(RPG_CHARACTER_DEFINITIONS.map(({ id }) => id)).size).toBe(
      RPG_CHARACTER_DEFINITIONS.length,
    );
    for (const theme of Object.values(WORLD_THEMES)) {
      expect(theme.appearances.length).toBeGreaterThanOrEqual(10);
      for (const id of theme.appearances)
        expect(rpgAppearanceSchema.safeParse(id).success).toBe(true);
    }
    for (const character of RPG_CHARACTER_DEFINITIONS) {
      for (const layer of RPG_CHARACTER_LAYERS) {
        const { source } = character.layers[layer];
        expect(source).toMatch(/^[a-z0-9-]+$/u);
      }
    }
    for (const id of [
      'rowan',
      'ash',
      'ivar',
      'sigrid',
      'tamsin',
      'emery',
      'linden',
      'leif',
      'runa',
      'eirik',
    ])
      expect(rpgAppearanceSchema.safeParse(id).success).toBe(true);
  });

  it('renders the same six idle layers and RGB tints as the playable outfit', () => {
    const appearance = getRpgCharacter('tamsin');
    const { container } = render(
      <>
        <RpgPortrait appearance="tamsin" />
        <RpgPortrait appearance="tamsin" />
      </>,
    );
    const portraits = container.querySelectorAll('svg.rpg-portrait');
    expect(portraits).toHaveLength(2);
    const imageLayers = portraits[0]!.querySelectorAll('image');
    expect(imageLayers).toHaveLength(6);
    RPG_CHARACTER_LAYERS.forEach((layer, index) => {
      const source = appearance.layers[layer];
      const image = imageLayers[index]!;
      expect(image).toHaveAttribute(
        'href',
        `/game-assets/lpc-characters/${source.source}/${layer}-idle.png`,
      );
      expect(image).toHaveAttribute('y', '-128');
      expect(image).toHaveAttribute('width', '192');
      expect(image).toHaveAttribute('height', '256');
      if (source.tint !== undefined) {
        const filterId = image.getAttribute('filter')!.slice(5, -1);
        const filter = document.getElementById(filterId)!;
        expect(filter).toHaveAttribute('color-interpolation-filters', 'sRGB');
        for (const [channel, shift] of [
          ['R', 16],
          ['G', 8],
          ['B', 0],
        ] as const) {
          expect(
            Number(filter.querySelector(`feFunc${channel}`)!.getAttribute('slope')),
          ).toBeCloseTo(((source.tint >> shift) & 255) / 255);
        }
      }
    });
    const filterIds = [...container.querySelectorAll('filter')].map((filter) => filter.id);
    expect(new Set(filterIds).size).toBe(filterIds.length);
  });
});
