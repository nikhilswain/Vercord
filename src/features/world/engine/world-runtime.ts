import type { AvatarId } from '../../../domain/avatar/identity';
import type { ClientPresenceLocation, PresencePlayer } from '../../../domain/presence/protocol';
import type { WorldDefinition, WorldPortal, WorldUiState } from './types';

export interface WorldCallbacks {
  onReady: () => void;
  onAssetError: () => void;
  onUiChange: (state: WorldUiState) => void;
  onSceneChange: (room: WorldPortal | null, reason?: 'refresh') => void;
  onPresenceMove?: (location: ClientPresenceLocation) => void;
}

export interface WorldRuntime {
  start(): void;
  resize(width: number, height: number): void;
  updateWorld(world: WorldDefinition): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  setVirtualAxis(x: number, y: number, sprinting?: boolean): void;
  interact(): void;
  enterRoomByKey(roomKey: string): boolean;
  setRemotePlayers(players: readonly PresencePlayer[]): void;
  setPlayerAvatar(avatarId: AvatarId): void;
  destroy(): void;
  rotateView?(radians: number): void;
  overview?(): void;
}

export type WorldRenderer = '2d' | '3d';

export function worldRendererFromSearch(search: string): WorldRenderer {
  return new URLSearchParams(search).get('renderer') === '2d' ? '2d' : '3d';
}

export function worldRendererHref(renderer: WorldRenderer): string {
  const url = new URL(window.location.href);
  url.searchParams.set('renderer', renderer);
  return `${url.pathname}${url.search}${url.hash}`;
}
