import type { RpgSample } from './types';
import { block, cell, object, TILE } from './builder';

/** Derive wall art and solid row spans from the same walkable floor mask. */
export function addDungeonWalls(sample: RpgSample, floor: ReadonlySet<string>): void {
  const cols = sample.bounds.width / TILE;
  const rows = sample.bounds.height / TILE;
  for (let y = 0; y < rows; y++) {
    let solidStart: number | null = null;
    for (let x = 0; x <= cols; x++) {
      if (x === cols || floor.has(cell(x, y))) {
        if (solidStart !== null) {
          block(sample, solidStart, y, x - solidStart, 1);
          solidStart = null;
        }
        continue;
      }
      solidStart ??= x;
      const border =
        floor.has(cell(x - 1, y)) ||
        floor.has(cell(x + 1, y)) ||
        floor.has(cell(x, y - 1)) ||
        floor.has(cell(x, y + 1));
      if (!border) continue;

      // Tall back walls may extend north only over solid ground. Cut away the
      // foreground and corner sections that would otherwise hide walkable floor.
      let top = Math.max(0, y - 2);
      for (let row = top; row < y; row++) {
        if (floor.has(cell(x, row))) top = row + 1;
      }
      for (let row = top; row <= y; row++) {
        const level = row === top ? 3 : row === y ? 5 : 4;
        object(sample, 'lpc-walls', level * 6 + ((x + y) % 3), x, row, y + 1);
      }
    }
  }
}
