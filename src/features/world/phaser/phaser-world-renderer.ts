import * as Phaser from 'phaser';

import type { AvatarId } from '../../../domain/avatar/identity';
import type { MapRoomType } from '../../../domain/map/snapshot';
import type { PresencePlayer } from '../../../domain/presence/protocol';
import type { WorldCamera } from '../engine/camera';
import type {
  Direction,
  PlayerState,
  Point,
  WorldArea,
  WorldDefinition,
  WorldPortal,
  WorldProp,
  WorldPropKind,
  WorldTheme,
  WorldTileStamp,
} from '../engine/types';

const WORLD_ATLAS_KEY = 'dmap-world-atlas';
const INTERIOR_ATLAS_KEY = 'dmap-interior-atlas';
const FALLBACK_AVATAR_ATLAS_KEY = 'dmap-fallback-avatar-atlas';
const AVATAR_KEY_PREFIX = 'dmap-avatar-layer';
const MINIMAP_WIDTH = 152;
const MINIMAP_HEIGHT = 102;
const MINIMAP_MARGIN = 24;
const FALLBACK_AVATAR_FRAMES: Record<Direction, number> = {
  right: 23,
  down: 24,
  up: 25,
  left: 26,
};

interface PlayerVisual {
  container: Phaser.GameObjects.Container;
  layers: Phaser.GameObjects.Sprite[];
  fallback: Phaser.GameObjects.Image | null;
  avatarId: AvatarId | null;
}

interface PortalVisual {
  activeMark: Phaser.GameObjects.Graphics;
}

interface RemotePlayerVisual {
  visual: PlayerVisual;
  displayed: PlayerState;
  target: PresencePlayer;
  avatarId: AvatarId;
}

function color(value: string | undefined, fallback = 0xffffff): number {
  if (!value) return fallback;
  try {
    return Phaser.Display.Color.HexStringToColor(value).color;
  } catch {
    return fallback;
  }
}

function avatarLayerKey(layerId: string): string {
  return `${AVATAR_KEY_PREFIX}-${layerId}`;
}

function avatarVariant(theme: WorldTheme, requestedId?: AvatarId) {
  const avatar = theme.avatar;
  if (!avatar) return null;
  return (
    avatar.variants.find(({ id }) => id === requestedId) ??
    avatar.variants.find(({ id }) => id === avatar.defaultVariantId) ??
    avatar.variants[0] ??
    null
  );
}

function interiorFrame(kind: WorldPropKind): string {
  return `prop-${kind}`;
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

function stampBounds(stamp: WorldTileStamp) {
  return {
    width: Math.max(0, ...stamp.tiles.map((row) => row.length)) * stamp.tileSize,
    height: stamp.tiles.length * stamp.tileSize,
  };
}

export function preloadWorldAssets(scene: Phaser.Scene, theme: WorldTheme): void {
  scene.load.spritesheet(WORLD_ATLAS_KEY, theme.atlasUrl, {
    frameWidth: theme.sourceTileSize,
    frameHeight: theme.sourceTileSize,
  });
  scene.load.spritesheet(FALLBACK_AVATAR_ATLAS_KEY, '/game-assets/kenney-urban/tiles.png', {
    frameWidth: 16,
    frameHeight: 16,
  });

  if (theme.interiorAtlas) scene.load.image(INTERIOR_ATLAS_KEY, theme.interiorAtlas.url);
  theme.avatar?.layers.forEach(({ id, url }) => {
    scene.load.spritesheet(avatarLayerKey(id), url, {
      frameWidth: theme.avatar!.frameSize,
      frameHeight: theme.avatar!.frameSize,
    });
  });
}

export function primaryWorldAssetLoaded(scene: Phaser.Scene): boolean {
  return scene.textures.exists(WORLD_ATLAS_KEY);
}

export class PhaserWorldRenderer {
  private world: WorldDefinition;
  private playerVisual: PlayerVisual | null = null;
  private routeGraphic: Phaser.GameObjects.Graphics | null = null;
  private portalVisuals = new Map<string, PortalVisual>();
  private remotePlayerVisuals = new Map<string, RemotePlayerVisual>();
  private minimap: Phaser.Cameras.Scene2D.Camera | null = null;
  private minimapViewport: Phaser.GameObjects.Graphics | null = null;
  private viewport = { width: 1, height: 1 };
  private playerAvatarId: AvatarId | undefined;

  public constructor(
    private readonly scene: Phaser.Scene,
    world: WorldDefinition,
  ) {
    this.world = world;
  }

  public rebuild(world: WorldDefinition, player: PlayerState): void {
    if (this.minimap) this.scene.cameras.remove(this.minimap, true);
    this.minimap = null;
    this.scene.children.removeAll(true);
    this.portalVisuals.clear();
    this.remotePlayerVisuals.clear();
    this.playerVisual = null;
    this.world = world;

    this.registerInteriorFrames(world.theme);
    if (world.environment === 'interior') this.addInteriorShell(world);
    else this.addExteriorGround(world);

    world.tileStamps
      .filter((stamp) => stamp.layer === 'floor')
      .forEach((stamp) => this.addStamp(stamp, -4_000));
    world.props
      .filter((prop) => prop.layer === 'floor')
      .forEach((prop) => this.addProp(prop, -3_500));

    world.tileStamps
      .filter((stamp) => stamp.layer !== 'floor')
      .forEach((stamp) => {
        const bounds = stampBounds(stamp);
        this.addStamp(stamp, stamp.sortY ?? stamp.y + bounds.height);
      });
    world.props
      .filter((prop) => prop.layer !== 'floor')
      .forEach((prop) => this.addProp(prop, prop.y + prop.height));
    world.portals.forEach((portal) => this.addPortal(portal));

    this.routeGraphic = this.scene.add.graphics().setDepth(-100);
    this.playerVisual = this.addPlayerVisual(player, 'you', 0x5c4bd8, this.playerAvatarId);
    this.minimapViewport = this.scene.add.graphics().setDepth(1_000_000);
    this.scene.cameras.main.ignore(this.minimapViewport);
    this.configureCameras();
  }

  public resize(width: number, height: number): void {
    this.viewport = { width, height };
    this.scene.cameras.main.setViewport(0, 0, width, height);
    this.configureMinimap();
  }

  public setPlayerAvatar(avatarId: AvatarId, player: PlayerState): void {
    if (this.playerAvatarId === avatarId && this.playerVisual?.avatarId === avatarId) return;
    this.playerAvatarId = avatarId;
    if (!this.playerVisual) return;
    this.playerVisual.container.destroy(true);
    this.playerVisual = this.addPlayerVisual(player, 'you', 0x5c4bd8, avatarId);
  }

  public update(
    player: PlayerState,
    elapsed: number,
    reduceMotion: boolean,
    route: Point[],
    routeTarget: Point | null,
    nearbyPortal: WorldPortal | null,
    camera: WorldCamera,
    remotePlayers: readonly PresencePlayer[],
    presenceScene: PresencePlayer['scene'],
    deltaSeconds: number,
  ): void {
    this.updatePlayer(player, elapsed, reduceMotion);
    this.updateRemotePlayers(remotePlayers, presenceScene, elapsed, reduceMotion, deltaSeconds);
    this.updateRoute(player, route, routeTarget);
    this.portalVisuals.forEach(({ activeMark }, key) => {
      activeMark.setVisible(key === nearbyPortal?.key);
    });

    const main = this.scene.cameras.main;
    main.setZoom(camera.zoom);
    main.centerOn(
      camera.x + this.viewport.width / camera.zoom / 2,
      camera.y + this.viewport.height / camera.zoom / 2,
    );
    this.updateMinimapViewport(camera);
  }

  private registerInteriorFrames(theme: WorldTheme): void {
    if (!theme.interiorAtlas || !this.scene.textures.exists(INTERIOR_ATLAS_KEY)) return;
    const texture = this.scene.textures.get(INTERIOR_ATLAS_KEY);
    Object.entries(theme.interiorAtlas.sprites).forEach(([kind, bounds]) => {
      if (!bounds) return;
      const name = interiorFrame(kind as WorldPropKind);
      if (!texture.has(name)) {
        texture.add(name, 0, bounds.x, bounds.y, bounds.width, bounds.height);
      }
    });
  }

  private addExteriorGround(world: WorldDefinition): void {
    this.scene.cameras.main.setBackgroundColor('#2f594b');
    this.scene.add
      .rectangle(world.bounds.x, world.bounds.y, world.bounds.width, world.bounds.height, 0x7ec665)
      .setOrigin(0)
      .setDepth(-10_000);

    const ground = this.scene.add
      .tileSprite(
        world.bounds.x,
        world.bounds.y,
        world.bounds.width,
        world.bounds.height,
        WORLD_ATLAS_KEY,
        world.theme.tiles.ground,
      )
      .setOrigin(0)
      .setDepth(-9_900);
    const scale = world.theme.worldTileSize / world.theme.sourceTileSize;
    ground.setTileScale(scale, scale);

    world.tileLayers.forEach((layer) => {
      this.addTile(
        layer.tileIndex,
        layer.bounds.x,
        layer.bounds.y,
        layer.bounds.width,
        layer.bounds.height,
        -9_000,
      );
    });
    world.areas.forEach((area) => this.addAreaPlaque(area));
  }

  private addInteriorShell(world: WorldDefinition): void {
    this.scene.cameras.main.setBackgroundColor('#11141d');
    const accent = color(world.areas[0]?.accent, 0x9284f7);
    const borderSize = world.interiorStyle?.floorTile.width ?? 16;
    const wallHeight = world.interiorStyle?.wallPanel.height ?? 48;
    const inset = borderSize;
    const floorTop = borderSize + wallHeight;
    const bottomWallTop = world.bounds.height - borderSize;
    const doorwayHalfWidth = borderSize * 2;
    const doorwayLeft = world.bounds.width / 2 - doorwayHalfWidth;
    const doorwayRight = world.bounds.width / 2 + doorwayHalfWidth;

    this.scene.add
      .rectangle(0, 0, world.bounds.width, world.bounds.height, 0x171923)
      .setOrigin(0)
      .setDepth(-10_000);

    if (world.interiorStyle && this.scene.textures.exists(INTERIOR_ATLAS_KEY)) {
      const texture = this.scene.textures.get(INTERIOR_ATLAS_KEY);
      const { wallPanel, floorTile } = world.interiorStyle;
      const wallFrame = `wall-${wallPanel.x}-${wallPanel.y}`;
      const floorFrame = `floor-${floorTile.x}-${floorTile.y}`;
      if (!texture.has(wallFrame)) {
        texture.add(wallFrame, 0, wallPanel.x, wallPanel.y, wallPanel.width, wallPanel.height);
      }
      if (!texture.has(floorFrame)) {
        texture.add(floorFrame, 0, floorTile.x, floorTile.y, floorTile.width, floorTile.height);
      }

      this.scene.add
        .tileSprite(
          inset,
          floorTop - wallHeight,
          world.bounds.width - inset * 2,
          wallHeight,
          INTERIOR_ATLAS_KEY,
          wallFrame,
        )
        .setOrigin(0)
        .setDepth(-9_900);
      this.scene.add
        .tileSprite(
          inset,
          floorTop,
          world.bounds.width - inset * 2,
          bottomWallTop - floorTop,
          INTERIOR_ATLAS_KEY,
          floorFrame,
        )
        .setOrigin(0)
        .setDepth(-9_900);
      this.scene.add
        .tileSprite(
          doorwayLeft,
          bottomWallTop,
          doorwayRight - doorwayLeft,
          borderSize,
          INTERIOR_ATLAS_KEY,
          floorFrame,
        )
        .setOrigin(0)
        .setDepth(-9_900);
    } else {
      this.scene.add
        .rectangle(inset, borderSize, world.bounds.width - inset * 2, wallHeight, 0x8b7c6c)
        .setOrigin(0)
        .setDepth(-9_900);
      this.scene.add
        .rectangle(
          inset,
          floorTop,
          world.bounds.width - inset * 2,
          bottomWallTop - floorTop,
          0xb88a4d,
        )
        .setOrigin(0)
        .setDepth(-9_900);
      this.scene.add
        .rectangle(doorwayLeft, bottomWallTop, doorwayRight - doorwayLeft, borderSize, 0xb88a4d)
        .setOrigin(0)
        .setDepth(-9_900);
    }

    const shell = this.scene.add.graphics().setDepth(-9_800);
    const trimSize = Math.max(2, Math.round(borderSize / 8));
    const jambSize = Math.max(3, Math.round(borderSize / 4));
    shell.fillStyle(0x2b2025);
    shell.fillRect(0, 0, world.bounds.width, borderSize);
    shell.fillRect(0, 0, inset, world.bounds.height);
    shell.fillRect(world.bounds.width - inset, 0, inset, world.bounds.height);
    shell.fillRect(0, bottomWallTop, doorwayLeft, borderSize);
    shell.fillRect(doorwayRight, bottomWallTop, world.bounds.width - doorwayRight, borderSize);
    shell.fillStyle(0x573526);
    shell.fillRect(inset, borderSize - trimSize, world.bounds.width - inset * 2, trimSize);
    shell.fillRect(0, bottomWallTop, doorwayLeft, trimSize);
    shell.fillRect(doorwayRight, bottomWallTop, world.bounds.width - doorwayRight, trimSize);
    shell.fillRect(doorwayLeft - jambSize, bottomWallTop, jambSize, borderSize);
    shell.fillRect(doorwayRight, bottomWallTop, jambSize, borderSize);
    shell.fillStyle(accent);
    shell.fillRect(
      doorwayLeft + jambSize,
      world.bounds.height - 4,
      doorwayRight - doorwayLeft - jambSize * 2,
      3,
    );

    const title = this.scene.add
      .text(30, 9, world.name, {
        color: '#f4f6ff',
        fontFamily: '"Barlow Condensed", sans-serif',
        fontSize: '8px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(20);
    const titleWidth = Phaser.Math.Clamp(title.width + 22, 80, 160);
    const plaque = this.scene.add.graphics().setDepth(19);
    plaque.fillStyle(0x171923).fillRect(24, 2, titleWidth, 14);
    plaque.fillStyle(accent).fillRect(24, 2, 2, 14);
  }

  private addAreaPlaque(area: WorldArea): void {
    const roomCount = `${area.roomCount} room${area.roomCount === 1 ? '' : 's'}`;
    const label = this.scene.add
      .text(17, 23, area.label, {
        color: '#f4f6ff',
        fontFamily: '"Barlow Condensed", sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const count = this.scene.add
      .text(0, 23, roomCount, {
        color: '#a8b2ca',
        fontFamily: '"Cascadia Mono", monospace',
        fontSize: '10px',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);
    const plaqueWidth = Math.min(
      area.bounds.width - 48,
      Math.max(184, label.width + count.width + 78),
    );
    count.x = plaqueWidth - 12;

    const background = this.scene.add.graphics();
    background.fillStyle(0x172136, 0.9).fillRoundedRect(0, 0, plaqueWidth, 46, 5);
    background.fillStyle(color(area.accent)).fillRect(0, 0, 5, 46);
    this.scene.add
      .container(area.bounds.x + 18, area.bounds.y + 14, [background, label, count])
      .setDepth(area.bounds.y + 61);
  }

  private addTile(
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
  ): Phaser.GameObjects.Image {
    return this.scene.add
      .image(x + width / 2, y + height / 2, WORLD_ATLAS_KEY, index)
      .setDisplaySize(width, height)
      .setDepth(depth);
  }

  private addTileMatrix(
    tiles: Array<Array<number | null>>,
    x: number,
    y: number,
    tileSize: number,
    depth: number,
  ): void {
    tiles.forEach((row, rowIndex) => {
      row.forEach((tileIndex, columnIndex) => {
        if (tileIndex === null) return;
        this.addTile(
          tileIndex,
          x + columnIndex * tileSize,
          y + rowIndex * tileSize,
          tileSize,
          tileSize,
          depth,
        );
      });
    });
  }

  private addStamp(stamp: WorldTileStamp, depth: number): void {
    this.addTileMatrix(stamp.tiles, stamp.x, stamp.y, stamp.tileSize, depth);
  }

  private addPortal(portal: WorldPortal): void {
    if (portal.destination === 'world') {
      this.addExitPortal(portal);
      return;
    }

    const buildings = this.world.theme.exterior?.buildings ?? [];
    const building = buildings[(portal.buildingStyle ?? 0) % Math.max(1, buildings.length)];
    const tiles = building?.tiles ?? [
      [48, 49, 50],
      [60, 63, 62],
      [72, 73, 75],
      [72, 85, 75],
    ];
    const doorColumn = building?.doorColumn ?? 1;
    const tileSize = this.world.theme.worldTileSize;
    this.addTileMatrix(
      tiles,
      portal.x - (doorColumn + 0.5) * tileSize,
      portal.y - tiles.length * tileSize,
      tileSize,
      portal.y,
    );

    const labelText = this.scene.add
      .text(0, 15, portal.room.label, {
        color: '#f4f6ff',
        fontFamily: '"Inter Variable", sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const labelWidth = Phaser.Math.Clamp(labelText.width + 52, 126, 190);
    labelText.x = -labelWidth / 2 + 30;
    labelText.setFixedSize(labelWidth - 39, 24);
    const glyph = this.scene.add
      .text(-labelWidth / 2 + 11, 15, roomGlyph(portal.room.type), {
        color: portal.accent,
        fontFamily: '"Inter Variable", sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const background = this.scene.add.graphics();
    background.fillStyle(0x18233d, 0.92).fillRoundedRect(-labelWidth / 2, 0, labelWidth, 30, 6);
    const activeMark = this.scene.add.graphics().setVisible(false);
    activeMark
      .fillStyle(color(portal.accent))
      .fillRect(-labelWidth / 2 + 7, 25, labelWidth - 14, 4);
    this.scene.add
      .container(portal.x, portal.y + 8, [background, activeMark, glyph, labelText])
      .setDepth(portal.y + 0.5);
    this.portalVisuals.set(portal.key, { activeMark });
  }

  private addExitPortal(portal: WorldPortal): void {
    const background = this.scene.add.graphics();
    background.fillStyle(0x65718a).fillRect(-19, 19, 38, 3);
    background.fillStyle(0x18233d, 0.9).fillRoundedRect(-17, 0, 34, 13, 3);
    const activeMark = this.scene.add.graphics().setVisible(false);
    activeMark.fillStyle(color(portal.accent)).fillRect(-19, 19, 38, 3);
    const label = this.scene.add
      .text(0, 6.5, 'EXIT', {
        color: '#f4f6ff',
        fontFamily: '"Cascadia Mono", monospace',
        fontSize: '6px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.scene.add
      .container(portal.x, portal.y - 10, [background, activeMark, label])
      .setDepth(portal.y);
    this.portalVisuals.set(portal.key, { activeMark });
  }

  private addProp(prop: WorldProp, depth: number): void {
    const frame = interiorFrame(prop.kind);
    const canUseAtlas =
      this.world.environment === 'interior' &&
      this.scene.textures.exists(INTERIOR_ATLAS_KEY) &&
      this.scene.textures.get(INTERIOR_ATLAS_KEY).has(frame);
    if (canUseAtlas) {
      this.scene.add
        .image(prop.x, prop.y, INTERIOR_ATLAS_KEY, frame)
        .setOrigin(0)
        .setDisplaySize(prop.width, prop.height)
        .setDepth(depth);
      return;
    }

    if (prop.kind === 'tree') {
      this.addTileMatrix(
        [[4], [16]],
        prop.x,
        prop.y,
        Math.min(prop.width, this.world.theme.worldTileSize),
        depth,
      );
      return;
    }

    const graphic = this.scene.add.graphics().setDepth(depth);
    const { x, y, width, height } = prop;
    switch (prop.kind) {
      case 'screen':
        graphic.fillStyle(0x27324a).fillRoundedRect(x, y, width, height, 8);
        graphic
          .fillStyle(color(prop.tint, 0x45c5c7))
          .fillRect(x + 9, y + 9, width - 18, height - 18);
        graphic.fillStyle(0xf4f6ff, 0.24).fillRect(x + 18, y + 18, width * 0.38, 5);
        graphic.fillRect(x + 18, y + 30, width * 0.58, 5);
        break;
      case 'fountain':
        graphic.fillStyle(0x58667f).fillRoundedRect(x, y + 18, width, height - 18, 18);
        graphic
          .fillStyle(0x51b8cc)
          .fillEllipse(x + width / 2, y + height / 2 + 8, width * 0.8, height * 0.54);
        graphic.fillStyle(0xd9e1f2).fillRect(x + width / 2 - 7, y, 14, 45);
        break;
      case 'bench':
        graphic.fillStyle(0x8b5136).fillRect(x, y + 6, width, 16);
        graphic.fillStyle(0x3e4962).fillRect(x + 8, y + 22, 8, 10);
        graphic.fillRect(x + width - 16, y + 22, 8, 10);
        break;
      default:
        graphic.fillStyle(color(prop.tint, 0x8a5a3d)).fillRect(x, y, width, height);
    }
  }

  private addPlayerVisual(
    player: PlayerState,
    playerLabel: string,
    labelColor: number,
    requestedAvatarId?: AvatarId,
  ): PlayerVisual {
    const avatar = this.world.theme.avatar;
    const variant = avatarVariant(this.world.theme, requestedAvatarId);
    const layers: Phaser.GameObjects.Sprite[] = [];
    const children: Phaser.GameObjects.GameObject[] = [];
    let fallback: Phaser.GameObjects.Image | null = null;
    const hasAvatar =
      avatar !== undefined &&
      variant !== null &&
      variant.layerIds.length > 0 &&
      variant.layerIds.every((layerId) => this.scene.textures.exists(avatarLayerKey(layerId)));

    if (hasAvatar && avatar && variant) {
      variant.layerIds.forEach((layerId) => {
        const sprite = this.scene.add
          .sprite(0, 9, avatarLayerKey(layerId), 0)
          .setOrigin(0.5, 1)
          .setDisplaySize(avatar.renderSize, avatar.renderSize);
        layers.push(sprite);
        children.push(sprite);
      });
    } else {
      const fallbackAtlas = this.scene.textures.exists(FALLBACK_AVATAR_ATLAS_KEY)
        ? FALLBACK_AVATAR_ATLAS_KEY
        : WORLD_ATLAS_KEY;
      fallback = this.scene.add
        .image(
          0,
          9,
          fallbackAtlas,
          fallbackAtlas === FALLBACK_AVATAR_ATLAS_KEY
            ? FALLBACK_AVATAR_FRAMES.down
            : this.world.theme.tiles.player.down,
        )
        .setOrigin(0.5, 1)
        .setDisplaySize(36, 36);
      children.push(fallback);
    }

    const compact = this.world.environment === 'interior';
    const labelHeight = compact ? 12 : 20;
    const labelY = hasAvatar ? (compact ? -50 : -52) : compact ? -38 : -40;
    const maximumCharacters = compact ? 16 : 20;
    const glyphs = Array.from(playerLabel);
    const visibleLabel =
      glyphs.length > maximumCharacters
        ? `${glyphs.slice(0, maximumCharacters - 1).join('')}…`
        : playerLabel;
    const label = this.scene.add
      .text(0, labelY, visibleLabel, {
        color: '#f4f6ff',
        fontFamily: '"Inter Variable", sans-serif',
        fontSize: compact ? '7px' : '11px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const labelWidth = Phaser.Math.Clamp(
      Math.ceil(label.width + (compact ? 12 : 20)),
      compact ? 34 : 58,
      compact ? 92 : 142,
    );
    const labelBackground = this.scene.add
      .rectangle(0, labelY, labelWidth, labelHeight, labelColor)
      .setRounded(compact ? 4 : 7);
    children.push(labelBackground, label);

    const container = this.scene.add.container(player.x, player.y, children).setDepth(player.y);
    return { container, layers, fallback, avatarId: hasAvatar && variant ? variant.id : null };
  }

  private updatePlayer(player: PlayerState, elapsed: number, reduceMotion: boolean): void {
    const visual = this.playerVisual;
    if (!visual) return;
    this.updatePlayerVisual(visual, player, elapsed, reduceMotion);
  }

  private updatePlayerVisual(
    visual: PlayerVisual,
    player: PlayerState,
    elapsed: number,
    reduceMotion: boolean,
  ): void {
    visual.container.setPosition(Math.round(player.x), Math.round(player.y)).setDepth(player.y);

    const avatar = this.world.theme.avatar;
    if (avatar && visual.layers.length > 0) {
      const row = player.moving
        ? avatar.walkRows[player.direction]
        : avatar.idleRows[player.direction];
      const frame =
        player.moving && !reduceMotion
          ? Math.floor(elapsed / avatar.animationMs) % avatar.walkFrames
          : 0;
      visual.layers.forEach((sprite) => {
        const source = this.scene.textures.get(sprite.texture.key).getSourceImage() as {
          width: number;
        };
        const columns = Math.max(1, Math.floor(source.width / avatar.frameSize));
        sprite.setFrame(row * columns + frame);
      });
    } else if (visual.fallback) {
      visual.fallback.setFrame(
        visual.fallback.texture.key === FALLBACK_AVATAR_ATLAS_KEY
          ? FALLBACK_AVATAR_FRAMES[player.direction]
          : this.world.theme.tiles.player[player.direction],
      );
    }
  }

  private updateRemotePlayers(
    players: readonly PresencePlayer[],
    scene: PresencePlayer['scene'],
    elapsed: number,
    reduceMotion: boolean,
    deltaSeconds: number,
  ): void {
    const visibleIds = new Set<string>();
    for (const player of players) {
      if (player.scene !== scene) continue;
      visibleIds.add(player.id);
      let remote = this.remotePlayerVisuals.get(player.id);
      if (!remote || remote.avatarId !== player.avatarId) {
        const displayed: PlayerState = remote?.displayed ?? {
          x: player.x,
          y: player.y,
          direction: player.direction,
          moving: player.moving,
        };
        remote?.visual.container.destroy(true);
        remote = {
          visual: this.addPlayerVisual(displayed, player.displayName, 0x45c5c7, player.avatarId),
          displayed,
          target: player,
          avatarId: player.avatarId,
        };
        this.remotePlayerVisuals.set(player.id, remote);
      } else {
        remote.target = player;
      }

      const distance = Math.hypot(
        remote.target.x - remote.displayed.x,
        remote.target.y - remote.displayed.y,
      );
      const blend = distance > 320 ? 1 : 1 - Math.exp(-18 * deltaSeconds);
      remote.displayed.x = Phaser.Math.Linear(remote.displayed.x, remote.target.x, blend);
      remote.displayed.y = Phaser.Math.Linear(remote.displayed.y, remote.target.y, blend);
      remote.displayed.direction = remote.target.direction;
      remote.displayed.moving = remote.target.moving || distance > 2;
      this.updatePlayerVisual(remote.visual, remote.displayed, elapsed, reduceMotion);
    }

    for (const [id, remote] of this.remotePlayerVisuals) {
      if (visibleIds.has(id)) continue;
      remote.visual.container.destroy(true);
      this.remotePlayerVisuals.delete(id);
    }
  }

  private updateRoute(player: PlayerState, route: Point[], target: Point | null): void {
    const graphic = this.routeGraphic;
    if (!graphic) return;
    graphic.clear();
    if (route.length === 0 || !target) return;
    graphic.lineStyle(4, 0xc9c0ff, 0.68);
    graphic.beginPath().moveTo(player.x, player.y);
    route.forEach((point) => graphic.lineTo(point.x, point.y));
    graphic.strokePath();
    graphic.lineStyle(3, 0xc9c0ff, 1).strokeCircle(target.x, target.y, 10);
  }

  private configureCameras(): void {
    const main = this.scene.cameras.main;
    main.setRoundPixels(true);
    this.configureMinimap();
  }

  private configureMinimap(): void {
    if (!this.minimapViewport) return;
    if (this.viewport.width < 620) {
      if (this.minimap) this.minimap.setVisible(false);
      return;
    }

    const x = this.viewport.width - MINIMAP_WIDTH - MINIMAP_MARGIN;
    const y = this.viewport.height - MINIMAP_HEIGHT - MINIMAP_MARGIN;
    if (!this.minimap) {
      this.minimap = this.scene.cameras.add(
        x,
        y,
        MINIMAP_WIDTH,
        MINIMAP_HEIGHT,
        false,
        'world-minimap',
      );
      this.minimap.setBackgroundColor('rgba(8, 12, 24, 0.82)').setRoundPixels(true);
    } else {
      this.minimap.setVisible(true).setViewport(x, y, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    }
    const zoom = Math.min(
      MINIMAP_WIDTH / this.world.bounds.width,
      MINIMAP_HEIGHT / this.world.bounds.height,
    );
    this.minimap.setZoom(zoom);
    this.minimap.centerOn(
      this.world.bounds.x + this.world.bounds.width / 2,
      this.world.bounds.y + this.world.bounds.height / 2,
    );
  }

  private updateMinimapViewport(camera: WorldCamera): void {
    if (!this.minimapViewport || !this.minimap?.visible) return;
    const visible = camera.visibleBounds();
    const minimapZoom = this.minimap.zoom;
    this.minimapViewport.clear();
    this.minimapViewport
      .lineStyle(Math.max(2, 2 / minimapZoom), 0xf4f6ff, 0.95)
      .strokeRect(visible.x, visible.y, visible.width, visible.height);
  }
}
