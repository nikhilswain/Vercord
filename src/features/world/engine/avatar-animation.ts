import type { Direction } from './types';

export interface AvatarAnimation {
  directionColumns: Record<Direction, number>;
  idleFrameRow: number;
  walkFrameRows: number[];
  flipX: Record<Direction, boolean>;
  animationMs: number;
}

export interface AvatarMotion {
  direction: Direction;
  moving: boolean;
}

export interface AvatarFrame {
  column: number;
  row: number;
  flipX: boolean;
}

export function resolveAvatarFrame(
  animation: AvatarAnimation,
  motion: AvatarMotion,
  elapsed: number,
  reduceMotion: boolean,
): AvatarFrame {
  const walkFrameIndex =
    Math.floor(elapsed / animation.animationMs) % animation.walkFrameRows.length;

  return {
    column: animation.directionColumns[motion.direction],
    row:
      motion.moving && !reduceMotion
        ? (animation.walkFrameRows[walkFrameIndex] ?? animation.idleFrameRow)
        : animation.idleFrameRow,
    flipX: animation.flipX[motion.direction],
  };
}
