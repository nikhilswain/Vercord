import { describe, expect, it } from 'vitest';

import { resolveAvatarFrame } from '../../../src/features/world/engine/avatar-animation';

const animation = {
  directionColumns: { down: 0, up: 2, left: 3, right: 1 },
  idleFrameRow: 0,
  walkFrameRows: [0, 1, 0, 2],
  flipX: { down: false, up: false, left: false, right: false },
  animationMs: 120,
};

describe('resolveAvatarFrame', () => {
  it('keeps the facing direction in one column while the walk pose advances down rows', () => {
    expect(resolveAvatarFrame(animation, { direction: 'right', moving: true }, 360, false)).toEqual(
      { column: 1, row: 2, flipX: false },
    );
  });

  it('uses each direction column with the neutral pose while idle or reduced-motion is active', () => {
    expect(resolveAvatarFrame(animation, { direction: 'up', moving: false }, 480, false)).toEqual({
      column: 2,
      row: 0,
      flipX: false,
    });
    expect(resolveAvatarFrame(animation, { direction: 'right', moving: true }, 480, true)).toEqual({
      column: 1,
      row: 0,
      flipX: false,
    });
  });
});
