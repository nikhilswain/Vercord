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
  WorldTileStamp,
} from './types';

interface RenderState {
  elapsed: number;
  player: PlayerState;
  nearbyPortal: WorldPortal | null;
  route: Point[];
  routeTarget: Point | null;
  reduceMotion: boolean;
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
  width = theme.worldTileSize,
  height = theme.worldTileSize,
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
  const tileSize = theme.worldTileSize;
  const startX = Math.max(rect.x, rect.x + Math.floor((clip.x - rect.x) / tileSize) * tileSize);
  const startY = Math.max(rect.y, rect.y + Math.floor((clip.y - rect.y) / tileSize) * tileSize);
  const endX = Math.min(rect.x + rect.width, clip.x + clip.width + tileSize);
  const endY = Math.min(rect.y + rect.height, clip.y + clip.height + tileSize);
  for (let y = startY; y < endY; y += tileSize) {
    for (let x = startX; x < endX; x += tileSize) {
      drawSheetTile(ctx, image, theme, index, x, y);
    }
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawTileLayers(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  world: WorldDefinition,
  visible: Rect,
): void {
  world.tileLayers
    .filter(({ bounds }) => intersects(bounds, visible))
    .forEach((layer) => {
      ctx.save();
      if (layer.radius) {
        roundedRect(
          ctx,
          layer.bounds.x,
          layer.bounds.y,
          layer.bounds.width,
          layer.bounds.height,
          layer.radius,
        );
        ctx.clip();
      }
      tileRect(ctx, image, world.theme, layer.tileIndex, layer.bounds, visible);
      ctx.restore();
    });
}

function drawTileMatrix(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  tiles: Array<Array<number | null>>,
  x: number,
  y: number,
  tileSize: number,
): void {
  tiles.forEach((row, rowIndex) => {
    row.forEach((tileIndex, columnIndex) => {
      if (tileIndex === null) return;
      drawSheetTile(
        ctx,
        image,
        theme,
        tileIndex,
        x + columnIndex * tileSize,
        y + rowIndex * tileSize,
        tileSize,
        tileSize,
      );
    });
  });
}

function tileStampBounds(stamp: WorldTileStamp): Rect {
  return {
    x: stamp.x,
    y: stamp.y,
    width: Math.max(0, ...stamp.tiles.map((row) => row.length)) * stamp.tileSize,
    height: stamp.tiles.length * stamp.tileSize,
  };
}

function drawTileStamp(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  theme: WorldTheme,
  stamp: WorldTileStamp,
): void {
  drawTileMatrix(ctx, image, theme, stamp.tiles, stamp.x, stamp.y, stamp.tileSize);
}

function drawArea(ctx: CanvasRenderingContext2D, area: WorldArea): void {
  const { x, y, width } = area.bounds;
  const roomCount = `${area.roomCount} room${area.roomCount === 1 ? '' : 's'}`;
  ctx.font = '700 22px "Barlow Condensed", sans-serif';
  const labelWidth = ctx.measureText(area.label).width;
  ctx.font = '600 10px "Cascadia Mono", monospace';
  const countWidth = ctx.measureText(roomCount).width;
  const plaqueWidth = Math.min(width - 48, Math.max(184, labelWidth + countWidth + 78));

  roundedRect(ctx, x + 18, y + 14, plaqueWidth, 46, 5);
  ctx.fillStyle = 'rgb(23 33 54 / 0.9)';
  ctx.fill();
  ctx.fillStyle = area.accent;
  ctx.fillRect(x + 18, y + 14, 5, 46);
  ctx.fillStyle = '#f4f6ff';
  ctx.font = '700 22px "Barlow Condensed", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(area.label, x + 35, y + 37, plaqueWidth - countWidth - 64);
  ctx.fillStyle = '#c9d1e2';
  ctx.font = '600 10px "Cascadia Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(roomCount, x + 18 + plaqueWidth - 12, y + 37);
  ctx.textAlign = 'left';
}

function drawInteriorShell(ctx: CanvasRenderingContext2D, world: WorldDefinition): void {
  const area = world.areas[0];
  const accent = area?.accent ?? '#9284f7';
  ctx.fillStyle = '#c8b99e';
  ctx.fillRect(0, 0, world.bounds.width, world.bounds.height);

  ctx.strokeStyle = 'rgb(71 59 46 / 0.13)';
  ctx.lineWidth = 1;
  for (let y = 48; y < world.bounds.height - 48; y += 32) {
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(world.bounds.width - 48, y);
    ctx.stroke();
  }
  for (let x = 48; x < world.bounds.width - 48; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 48);
    ctx.lineTo(x, world.bounds.height - 48);
    ctx.stroke();
  }

  ctx.fillStyle = '#313b54';
  ctx.fillRect(0, 0, world.bounds.width, 48);
  ctx.fillRect(0, 0, 48, world.bounds.height);
  ctx.fillRect(world.bounds.width - 48, 0, 48, world.bounds.height);
  ctx.fillRect(0, world.bounds.height - 48, 400, 48);
  ctx.fillRect(496, world.bounds.height - 48, world.bounds.width - 496, 48);
  ctx.fillStyle = accent;
  ctx.fillRect(48, 44, world.bounds.width - 96, 4);

  ctx.fillStyle = '#172136';
  roundedRect(ctx, 72, 10, Math.min(360, world.bounds.width - 144), 28, 6);
  ctx.fill();
  ctx.fillStyle = '#f4f6ff';
  ctx.font = '700 17px "Barlow Condensed", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(world.name, 88, 24, 310);

  ctx.fillStyle = '#18233d';
  ctx.fillRect(400, world.bounds.height - 48, 96, 48);
  ctx.fillStyle = accent;
  ctx.fillRect(407, world.bounds.height - 10, 82, 6);
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
): void {
  const x = Math.round(portal.x);
  const y = Math.round(portal.y);

  if (portal.destination === 'world') {
    ctx.fillStyle = active ? portal.accent : '#65718a';
    ctx.fillRect(x - 38, y + 18, 76, 6);
    roundedRect(ctx, x - 34, y - 20, 68, 26, 6);
    ctx.fillStyle = active ? '#18233d' : 'rgb(24 35 61 / 0.88)';
    ctx.fill();
    ctx.fillStyle = '#f4f6ff';
    ctx.font = '700 11px "Cascadia Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', x, y - 7);
    ctx.textAlign = 'left';
    return;
  }

  const buildings = theme.exterior?.buildings ?? [];
  const building = buildings[(portal.buildingStyle ?? 0) % Math.max(1, buildings.length)];
  if (building) {
    const tileSize = theme.worldTileSize;
    const startX = x - (building.doorColumn + 0.5) * tileSize;
    const startY = y - building.tiles.length * tileSize;
    drawTileMatrix(ctx, image, theme, building.tiles, startX, startY, tileSize);
  } else {
    drawTileMatrix(
      ctx,
      image,
      theme,
      [
        [48, 49, 50],
        [60, 63, 62],
        [72, 73, 75],
        [72, 85, 75],
      ],
      x - theme.worldTileSize * 1.5,
      y - theme.worldTileSize * 4,
      theme.worldTileSize,
    );
  }

  ctx.font = '700 13px "Inter Variable", sans-serif';
  const labelWidth = Math.max(126, Math.min(190, ctx.measureText(portal.room.label).width + 52));
  roundedRect(ctx, x - labelWidth / 2, y + 8, labelWidth, 30, 6);
  ctx.fillStyle = active ? '#18233d' : 'rgb(24 35 61 / 0.9)';
  ctx.fill();
  if (active) {
    ctx.fillStyle = portal.accent;
    ctx.fillRect(x - labelWidth / 2 + 7, y + 33, labelWidth - 14, 4);
  }
  ctx.fillStyle = portal.accent;
  ctx.textBaseline = 'middle';
  ctx.fillText(roomGlyph(portal.room.type), x - labelWidth / 2 + 11, y + 23);
  ctx.fillStyle = '#f4f6ff';
  ctx.fillText(portal.room.label, x - labelWidth / 2 + 30, y + 23, labelWidth - 39);
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  interiorImage: HTMLImageElement | null,
  world: WorldDefinition,
  prop: WorldProp,
): void {
  const { theme } = world;
  const { x, y, width, height } = prop;
  const interiorSprite =
    world.environment === 'interior' ? theme.interiorAtlas?.sprites[prop.kind] : undefined;
  if (interiorImage && interiorSprite) {
    ctx.drawImage(
      interiorImage,
      interiorSprite.x,
      interiorSprite.y,
      interiorSprite.width,
      interiorSprite.height,
      x,
      y,
      width,
      height,
    );
    return;
  }

  switch (prop.kind) {
    case 'tree':
      drawTileMatrix(ctx, image, theme, [[4], [16]], x, y, Math.min(width, theme.worldTileSize));
      break;
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
      ctx.fillStyle = '#43a777';
      ctx.fillRect(x, y, width, height);
      break;
    case 'building':
      ctx.fillStyle = prop.tint ?? '#c8764d';
      ctx.fillRect(x, y, width, height);
      break;
    case 'desk':
    case 'chair':
      ctx.fillStyle = '#8a5a3d';
      ctx.fillRect(x, y + 8, width, height - 24);
      ctx.fillStyle = '#b17a52';
      ctx.fillRect(x + 5, y, width - 10, 18);
      ctx.fillStyle = '#303b55';
      ctx.fillRect(x + 16, y + height - 20, 12, 20);
      ctx.fillRect(x + width - 28, y + height - 20, 12, 20);
      if (prop.tint) {
        ctx.fillStyle = prop.tint;
        ctx.fillRect(x + width / 2 - 18, y - 8, 36, 22);
      }
      break;
    case 'rug':
      ctx.fillStyle = prop.tint ?? '#a65d4a';
      ctx.fillRect(x, y, width, height);
      break;
    case 'sofa':
      ctx.fillStyle = prop.tint ?? '#63769a';
      roundedRect(ctx, x, y, width, height, 10);
      ctx.fill();
      ctx.fillStyle = 'rgb(244 246 255 / 0.14)';
      ctx.fillRect(x + 10, y + 10, width - 20, 10);
      ctx.strokeStyle = '#303b55';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 4, y + 4, width - 8, height - 8);
      break;
    case 'table':
      ctx.fillStyle = '#9a6847';
      roundedRect(ctx, x, y, width, height, 12);
      ctx.fill();
      ctx.strokeStyle = prop.tint ?? '#4e5a72';
      ctx.lineWidth = 5;
      ctx.stroke();
      break;
    case 'bookshelf':
      ctx.fillStyle = '#5b3c32';
      ctx.fillRect(x, y, width, height);
      for (let bookX = x + 8; bookX < x + width - 8; bookX += 14) {
        ctx.fillStyle = [theme.tiles.path % 2 === 0 ? '#d59645' : '#9284f7', '#45c5c7', '#f17c86'][
          Math.floor((bookX - x) / 14) % 3
        ] ?? '#d59645';
        ctx.fillRect(bookX, y + 8, 8, height - 15);
      }
      break;
    case 'screen':
      ctx.fillStyle = '#27324a';
      roundedRect(ctx, x, y, width, height, 8);
      ctx.fill();
      ctx.fillStyle = prop.tint ?? '#45c5c7';
      ctx.fillRect(x + 9, y + 9, width - 18, height - 18);
      ctx.fillStyle = 'rgb(244 246 255 / 0.24)';
      ctx.fillRect(x + 18, y + 18, width * 0.38, 5);
      ctx.fillRect(x + 18, y + 30, width * 0.58, 5);
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
  avatarImages: readonly HTMLImageElement[],
  theme: WorldTheme,
  player: PlayerState,
  elapsed: number,
  reduceMotion: boolean,
): void {
  const avatar = theme.avatar;
  const hasAvatar = avatar && avatarImages.length === avatar.layerUrls.length;
  const bob = !hasAvatar && player.moving && !reduceMotion ? Math.sin(elapsed / 70) * 1.5 : 0;

  if (hasAvatar) {
    const row = player.moving ? avatar.walkRows[player.direction] : avatar.idleRows[player.direction];
    const frame =
      player.moving && !reduceMotion
        ? Math.floor(elapsed / avatar.animationMs) % avatar.walkFrames
        : 0;
    const renderX = Math.round(player.x - avatar.renderSize / 2);
    const renderY = Math.round(player.y - avatar.renderSize + 9);
    avatarImages.forEach((layer) => {
      ctx.drawImage(
        layer,
        frame * avatar.frameSize,
        row * avatar.frameSize,
        avatar.frameSize,
        avatar.frameSize,
        renderX,
        renderY,
        avatar.renderSize,
        avatar.renderSize,
      );
    });
  } else {
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
  }

  const labelY = hasAvatar ? player.y - 62 : player.y - 50 + bob;
  roundedRect(ctx, player.x - 29, labelY, 58, 20, 7);
  ctx.fillStyle = '#5c4bd8';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px "Inter Variable", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('you', player.x, labelY + 10);
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
  avatarImages: readonly HTMLImageElement[],
  interiorImage: HTMLImageElement | null,
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

  if (world.environment === 'interior') {
    drawInteriorShell(ctx, world);
  } else {
    ctx.fillStyle = '#7ec665';
    ctx.fillRect(0, 0, world.bounds.width, world.bounds.height);
    tileRect(ctx, image, world.theme, world.theme.tiles.ground, world.bounds, visible);
    drawTileLayers(ctx, image, world, visible);
    world.areas
      .filter((area) => intersects(area.bounds, visibleWithMargin))
      .forEach((area) => drawArea(ctx, area));
  }
  const visibleProps = world.props.filter((prop) => intersects(prop, visibleWithMargin));
  const visibleStamps = world.tileStamps.filter((stamp) => intersects(tileStampBounds(stamp), visibleWithMargin));
  visibleStamps
    .filter((stamp) => stamp.layer === 'floor')
    .forEach((stamp) => drawTileStamp(ctx, image, world.theme, stamp));
  visibleProps
    .filter((prop) => prop.layer === 'floor')
    .forEach((prop) => drawProp(ctx, image, interiorImage, world, prop));
  drawRoute(ctx, state);

  const sorted = [
    ...visibleStamps
      .filter((stamp) => stamp.layer !== 'floor')
      .map((stamp) => {
        const bounds = tileStampBounds(stamp);
        return {
          y: stamp.sortY ?? bounds.y + bounds.height,
          draw: () => drawTileStamp(ctx, image, world.theme, stamp),
        };
      }),
    ...visibleProps
      .filter((prop) => prop.layer !== 'floor')
      .map((prop) => ({
        y: prop.y + prop.height,
        draw: () => drawProp(ctx, image, interiorImage, world, prop),
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
        ),
    })),
    {
      y: state.player.y,
      draw: () =>
        drawPlayer(
          ctx,
          image,
          avatarImages,
          world.theme,
          state.player,
          state.elapsed,
          state.reduceMotion,
        ),
    },
  ].sort((a, b) => a.y - b.y);
  sorted.forEach((item) => item.draw());
  ctx.restore();
  if (viewport.width >= 620) drawMiniMap(ctx, world, camera, viewport);
}

function containsPortal(portal: WorldPortal, rect: Rect): boolean {
  return portal.x >= rect.x && portal.x <= rect.x + rect.width && portal.y >= rect.y && portal.y <= rect.y + rect.height;
}
