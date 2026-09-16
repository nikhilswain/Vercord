import { useState } from 'react';

import type { AuthGuild } from './session';
import type { GuildSyncState } from './GuildPicker';

export function GuildMark({ guild }: { guild: AuthGuild }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (guild.iconUrl !== null && guild.iconUrl !== failedUrl) {
    return (
      <img
        className="guild-mark"
        src={guild.iconUrl}
        alt=""
        width="54"
        height="54"
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(guild.iconUrl)}
      />
    );
  }
  const initials = guild.name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase();
  return (
    <span className="guild-mark guild-mark--fallback" aria-hidden="true">
      {initials || 'D'}
    </span>
  );
}

export function GuildAction({
  guild,
  onSync,
  syncState,
  refreshing,
}: {
  guild: AuthGuild;
  onSync(guild: AuthGuild): void;
  syncState: GuildSyncState | undefined;
  refreshing: boolean;
}) {
  if (guild.worldUrl !== null && (!guild.connected || !guild.canManage)) {
    return (
      <a className="guild-action" href={guild.worldUrl}>
        Explore
        <span aria-hidden="true">→</span>
      </a>
    );
  }

  if (guild.connected && guild.canManage) {
    const pending = syncState?.kind === 'pending';
    const label = pending
      ? guild.synced
        ? 'Syncing…'
        : 'Creating…'
      : guild.synced
        ? 'Sync now'
        : 'Create world';

    return (
      <div className="guild-actions">
        {guild.worldUrl !== null ? (
          <a className="guild-action" href={guild.worldUrl}>
            Explore
            <span aria-hidden="true">→</span>
          </a>
        ) : null}
        <button
          className={guild.worldUrl === null ? 'guild-action' : 'guild-sync-button'}
          type="button"
          disabled={pending || refreshing}
          aria-busy={pending}
          onClick={() => onSync(guild)}
        >
          {label}
        </button>
        {syncState?.kind === 'success' ? (
          <span className="guild-sync-feedback" role="status">
            {syncState.message}
          </span>
        ) : syncState?.kind === 'error' ? (
          <span className="guild-sync-feedback guild-sync-feedback--error" role="alert">
            {syncState.message}
          </span>
        ) : guild.synced && guild.worldUrl === null ? (
          <span className="guild-sync-feedback">Private snapshot ready</span>
        ) : null}
      </div>
    );
  }

  if (guild.connected) {
    return (
      <span className="guild-action-note">
        {guild.synced
          ? 'A server manager must finish world setup'
          : 'A server manager must create this world'}
      </span>
    );
  }

  return (
    <span className="guild-action-note">
      {guild.canManage ? 'Dmap is not connected' : 'Member access'}
    </span>
  );
}
