import type { MapRoomType } from '../../../domain/map/snapshot';
import type { WorldCamera } from './camera';
import type {
  PlayerState,
  Point,
  Rect,
  WorldArea,
  WorldDefinition,
  WorldPortal,
  WorldProp,
  WorldTheme,
} from './types';

const WORLD_TILE = 32;

interface RenderState {
  elapsed: number;
  player: PlayerState;
  nearbyPortal: WorldPortal | null;
  route: Point[];
  routeTarget: Point | null;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawSheetTile(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  index: number,
  x: number,
  y: number,
  width = WORLD_TILE,
  height = WORLD_TILE,
): void {
  const sourceX = (index % theme.sheetColumns) * theme.sourceTileSize;
  const sourceY = Math.floor(index / theme.sheetColumns) * theme.sourceTileSize;
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    theme.sourceTileSize,
    theme.sourceTileSize,
    x,
    y,
    width,
    height,
  );
}

function tileRect(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  index: number,
  rect: Rect,
  clip = rect,
): void {
  const startX = Math.max(rect.x, rect.x + Math.floor((clip.x - rect.x) / WORLD_TILE) * WORLD_TILE);
  const startY = Math.max(rect.y, rect.y + Math.floor((clip.y - rect.y) / WORLD_TILE) * WORLD_TILE);
  const endX = Math.min(rect.x + rect.width, clip.x + clip.width + WORLD_TILE);
  const endY = Math.min(rect.y + rect.height, clip.y + clip.height + WORLD_TILE);
  for (let y = startY; y < endY; y += WORLD_TILE) {
    for (let x = startX; x < endX; x += WORLD_TILE) {
      drawSheetTile(ctx, image, theme, index, x, y);
    }
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawPaths(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  world: WorldDefinition,
  visible: Rect,
): void {
  world.paths.filter(({ bounds }) => intersects(bounds, visible)).forEach(({ bounds: path }) => {
    ctx.fillStyle = '#aeb2bd';
    ctx.fillRect(path.x, path.y, path.width, path.height);
    tileRect(ctx, image, world.theme, world.theme.tiles.path, path, visible);
    ctx.strokeStyle = 'rgb(31 43 65 / 0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(path.x + 2, path.y + 2, path.width - 4, path.height - 4);
  });
}

function drawArea(ctx: CanvasRenderingContext2D, area: WorldArea): void {
  const { x, y, width, height } = area.bounds;
  ctx.save();
  ctx.shadowColor = 'rgb(3 7 18 / 0.3)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, width, height, 18);
  ctx.fillStyle = '#d5d1c6';
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, x, y, width, height, 18);
  ctx.strokeStyle = '#647086';
  ctx.lineWidth = 8;
  ctx.stroke();
  roundedRect(ctx, x + 10, y + 10, width - 20, height - 20, 12);
  ctx.strokeStyle = area.accent;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#18233d';
  roundedRect(ctx, x + 24, y + 20, Math.min(230, width - 48), 48, 8);
  ctx.fill();
  ctx.fillStyle = '#f4f6ff';
  ctx.font = '700 24px "Barlow Condensed", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(area.label, x + 42, y + 44, width - 118);
  ctx.fillStyle = area.accent;
  ctx.beginPath();
  ctx.arc(x + 29, y + 44, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8b2ca';
  ctx.font = '600 11px "Cascadia Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${area.roomCount} ROOM${area.roomCount === 1 ? '' : 'S'}`, x + width - 24, y + 44);
  ctx.textAlign = 'left';
}

function roomGlyph(type: MapRoomType): string {
  switch (type) {
    case 'voice':
      return '◖';
    case 'announcement':
      return '▸';
    case 'stage':
      return '◆';
    case 'forum':
      return '▤';
    case 'media':
      return '▣';
    case 'unsupported':
      return '?';
    default:
      return '#';
  }
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  portal: WorldPortal,
  active: boolean,
  elapsed: number,
): void {
  const x = Math.round(portal.x);
  const y = Math.round(portal.y);
  const pulse = active ? 4 + Math.sin(elapsed / 160) * 2 : 0;

  ctx.fillStyle = 'rgb(3 7 18 / 0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 50, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d98658';
  ctx.fillRect(x - 44, y - 69, 88, 43);
  for (let roofX = x - 48; roofX < x + 48; roofX += 32) {
    drawSheetTile(ctx, image, theme, theme.tiles.roof, roofX, y - 82, 32, 24);
  }
  ctx.fillStyle = '#46516c';
  ctx.fillRect(x - 15, y - 55, 30, 31);
  ctx.fillStyle = '#18233d';
  ctx.fillRect(x - 10, y - 50, 20, 26);
  ctx.fillStyle = portal.accent;
  ctx.fillRect(x - 7, y - 47, 14, 18);

  if (active) {
    ctx.strokeStyle = portal.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 28, 34 + pulse, 0, Math.PI * 2);
    ctx.stroke();
  }

  roundedRect(ctx, x - 48, y + 10, 96, 28, 7);
  ctx.fillStyle = active ? '#18233d' : 'rgb(24 35 61 / 0.9)';
  ctx.fill();
  ctx.fillStyle = portal.accent;
  ctx.font = '700 13px "Inter Variable", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(roomGlyph(portal.room.type), x - 39, y + 24);
  ctx.fillStyle = '#f4f6ff';
  ctx.fillText(portal.room.label, x - 22, y + 24, 64);
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  prop: WorldProp,
): void {
  const { x, y, width, height } = prop;
  switch (prop.kind) {
    case 'tree': {
      ctx.fillStyle = 'rgb(3 7 18 / 0.2)';
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height - 6, width * 0.38, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8b5a3c';
      ctx.fillRect(x + width / 2 - 7, y + 42, 14, 32);
      ctx.fillStyle = '#2e9f74';
      ctx.fillRect(x + 14, y + 12, 36, 44);
      drawSheetTile(ctx, image, theme, theme.tiles.tree, x + 16, y + 8, 32, 32);
      break;
    }
    case 'bench':
      ctx.fillStyle = '#8b5136';
      ctx.fillRect(x, y + 6, width, 16);
      ctx.fillStyle = '#3e4962';
      ctx.fillRect(x + 8, y + 22, 8, 10);
      ctx.fillRect(x + width - 16, y + 22, 8, 10);
      break;
    case 'fountain':
      ctx.fillStyle = '#58667f';
      roundedRect(ctx, x, y + 18, width, height - 18, 18);
      ctx.fill();
      ctx.fillStyle = '#51b8cc';
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2 + 8, width * 0.4, height * 0.27, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d9e1f2';
      ctx.fillRect(x + width / 2 - 7, y, 14, 45);
      break;
    case 'planter':
      ctx.fillStyle = '#9a5a3a';
      ctx.fillRect(x + 5, y + 23, width - 10, height - 23);
      ctx.fillStyle = '#43a777';
      ctx.beginPath();
      ctx.arc(x + width / 2, y + 19, width * 0.38, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'building':
      ctx.fillStyle = prop.tint ?? '#c8764d';
      ctx.fillRect(x, y, width, height);
      break;
  }
}

function drawRoute(ctx: CanvasRenderingContext2D, state: RenderState): void {
  if (state.route.length === 0 || !state.routeTarget) return;
  ctx.strokeStyle = 'rgb(201 192 255 / 0.68)';
  ctx.lineWidth = 4;
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.moveTo(state.player.x, state.player.y);
  state.route.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c9c0ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(state.routeTarget.x, state.routeTarget.y, 10, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  player: PlayerState,
  elapsed: number,
): void {
  const bob = player.moving ? Math.sin(elapsed / 70) * 1.5 : 0;
  ctx.fillStyle = 'rgb(3 7 18 / 0.28)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 9, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  drawSheetTile(
    ctx,
    image,
    theme,
    theme.tiles.player[player.direction],
    player.x - 18,
    player.y - 27 + bob,
    36,
    36,
  );

  roundedRect(ctx, player.x - 29, player.y - 50 + bob, 58, 20, 7);
  ctx.fillStyle = '#5c4bd8';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px "Inter Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('you', player.x, player.y - 40 + bob);
  ctx.textAlign = 'left';
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  world: WorldDefinition,
  camera: WorldCamera,
  viewport: { width: number; height: number },
): void {
  const width = 152;
  const height = 102;
  const x = viewport.width - width - 24;
  const y = viewport.height - height - 24;
  const scaleX = width / world.bounds.width;
  const scaleY = height / world.bounds.height;
  roundedRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = 'rgb(8 12 24 / 0.78)';
  ctx.fill();
  world.areas.forEach((area) => {
    ctx.fillStyle = `${area.accent}aa`;
    ctx.fillRect(
      x + area.bounds.x * scaleX,
      y + area.bounds.y * scaleY,
      area.bounds.width * scaleX,
      area.bounds.height * scaleY,
    );
  });
  ctx.strokeStyle = '#f4f6ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    x + camera.x * scaleX,
    y + camera.y * scaleY,
    Math.min(world.bounds.width, viewport.width / camera.zoom) * scaleX,
    Math.min(world.bounds.height, viewport.height / camera.zoom) * scaleY,
  );
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  world: WorldDefinition,
  camera: WorldCamera,
  viewport: { width: number; height: number },
  state: RenderState,
): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.imageSmoothingEnabled = false;
  const visible = camera.visibleBounds();
  const visibleWithMargin = {
    x: visible.x - 96,
    y: visible.y - 96,
    width: visible.width + 192,
    height: visible.height + 192,
  };

  ctx.fillStyle = '#67a86b';
  ctx.fillRect(0, 0, world.bounds.width, world.bounds.height);
  tileRect(ctx, image, world.theme, world.theme.tiles.ground, world.bounds, visible);
  drawPaths(ctx, image, world, visible);
  world.areas.filter((area) => intersects(area.bounds, visibleWithMargin)).forEach((area) => drawArea(ctx, area));
  drawRoute(ctx, state);

  const sorted = [
    ...world.props
      .filter((prop) => intersects(prop, visibleWithMargin))
      .map((prop) => ({
        y: prop.y + prop.height,
        draw: () => drawProp(ctx, image, world.theme, prop),
      })),
    ...world.portals.filter((portal) => containsPortal(portal, visibleWithMargin)).map((portal) => ({
      y: portal.y,
      draw: () =>
        drawPortal(
          ctx,
          image,
          world.theme,
          portal,
          state.nearbyPortal?.key === portal.key,
          state.elapsed,
        ),
    })),
    {
      y: state.player.y,
      draw: () => drawPlayer(ctx, image, world.theme, state.player, state.elapsed),
    },
  ].sort((a, b) => a.y - b.y);
  sorted.forEach((item) => item.draw());
  ctx.restore();
  if (viewport.width >= 620) drawMiniMap(ctx, world, camera, viewport);
}

function containsPortal(portal: WorldPortal, rect: Rect): boolean {
  return portal.x >= rect.x && portal.x <= rect.x + rect.width && portal.y >= rect.y && portal.y <= rect.y + rect.height;
}
