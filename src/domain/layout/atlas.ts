import { orderedMapAreas, orderedMapRooms } from '../map/order';
import type { MapArea, MapSnapshot } from '../map/snapshot';
import {
  ATLAS_LAYOUT_CONSTANTS,
  type AreaGeometry,
  type AtlasGeometry,
  type AtlasVariant,
  type RoomGeometry,
  type RouteGeometry,
} from './geometry';
import { assertAtlasGeometry } from './invariants';

const C = ATLAS_LAYOUT_CONSTANTS;

function variantAt(index: number): AtlasVariant {
  switch (index % 3) {
    case 0:
      return 'violet';
    case 1:
      return 'cyan';
    default:
      return 'amber';
  }
}

function measureArea(roomCount: number) {
  const columns = Math.min(
    C.maxRoomColumns,
    Math.max(1, Math.ceil(Math.sqrt(Math.max(roomCount, 1)))),
  );
  const rows = Math.max(1, Math.ceil(roomCount / columns));
  const gridWidth = columns * C.roomWidth + (columns - 1) * C.roomGap;
  const gridHeight = rows * C.roomHeight + (rows - 1) * C.roomGap;
  return {
    columns,
    rows,
    width: Math.max(C.minimumDistrictWidth, C.districtPadding * 2 + gridWidth),
    height: C.districtPadding * 2 + C.districtHeaderHeight + gridHeight,
  };
}

export function shouldWrapShelf(cursorX: number, width: number, shelfHasArea: boolean): boolean {
  return shelfHasArea && cursorX + width > C.outerInset + C.shelfContentWidth;
}

function placeArea(sourceArea: MapArea, x: number, y: number, areaIndex: number): AreaGeometry {
  const measured = measureArea(sourceArea.rooms.length);
  const rooms = orderedMapRooms(sourceArea).map((sourceRoom, index): RoomGeometry => {
    const column = index % measured.columns;
    const row = Math.floor(index / measured.columns);
    return {
      key: sourceRoom.key,
      areaKey: sourceArea.key,
      x: x + C.districtPadding + column * (C.roomWidth + C.roomGap),
      y: y + C.districtPadding + C.districtHeaderHeight + row * (C.roomHeight + C.roomGap),
      width: C.roomWidth,
      height: C.roomHeight,
    };
  });
  return {
    key: sourceArea.key,
    variant: variantAt(areaIndex),
    x,
    y,
    width: measured.width,
    height: measured.height,
    rooms,
  };
}

function connectAreas(from: AreaGeometry, to: AreaGeometry, index: number): RouteGeometry {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const horizontal = Math.abs(toCenter.x - fromCenter.x) >= Math.abs(toCenter.y - fromCenter.y);
  const start = horizontal
    ? {
        x: fromCenter.x <= toCenter.x ? from.x + from.width : from.x,
        y: fromCenter.y,
      }
    : {
        x: fromCenter.x,
        y: fromCenter.y <= toCenter.y ? from.y + from.height : from.y,
      };
  const end = horizontal
    ? {
        x: fromCenter.x <= toCenter.x ? to.x : to.x + to.width,
        y: toCenter.y,
      }
    : {
        x: toCenter.x,
        y: fromCenter.y <= toCenter.y ? to.y : to.y + to.height,
      };
  const midpoint = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  const controlA = horizontal ? { x: midpoint, y: start.y } : { x: start.x, y: midpoint };
  const controlB = horizontal ? { x: midpoint, y: end.y } : { x: end.x, y: midpoint };
  return {
    key: 'route-' + (index + 1),
    variant: variantAt(index),
    start,
    controlA,
    controlB,
    end,
  };
}

export function layoutAtlas(snapshot: MapSnapshot): AtlasGeometry {
  const areas: AreaGeometry[] = [];
  let cursorX = C.outerInset;
  let cursorY = C.outerInset;
  let shelfHeight = 0;
  let shelfHasArea = false;
  let maximumRight = 0;
  let maximumBottom = 0;

  for (const sourceArea of orderedMapAreas(snapshot)) {
    const measured = measureArea(sourceArea.rooms.length);
    if (shouldWrapShelf(cursorX, measured.width, shelfHasArea)) {
      cursorX = C.outerInset;
      cursorY += shelfHeight + C.districtGap;
      shelfHeight = 0;
    }
    const area = placeArea(sourceArea, cursorX, cursorY, areas.length);
    areas.push(area);
    maximumRight = Math.max(maximumRight, area.x + area.width);
    maximumBottom = Math.max(maximumBottom, area.y + area.height);
    cursorX += measured.width + C.districtGap;
    shelfHeight = Math.max(shelfHeight, measured.height);
    shelfHasArea = true;
  }

  const routes = areas
    .slice(0, -1)
    .map((area, index) => connectAreas(area, areas[index + 1]!, index));
  const geometry: AtlasGeometry = {
    layoutVersion: 1,
    width: Math.max(C.minimumWidth, maximumRight + C.outerInset),
    height: Math.max(C.minimumHeight, maximumBottom + C.outerInset),
    areas,
    routes,
  };
  assertAtlasGeometry(snapshot, geometry);
  return geometry;
}
