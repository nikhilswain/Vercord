import { useState, type ReactNode } from 'react';

import { ButtonPet } from '../../components/ButtonPet';
import { petForSeed, type ButtonPetKind } from '../../components/pets';
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

function PrimaryCta({
  href,
  onClick,
  disabled,
  busy,
  pet,
  children,
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  pet: ButtonPetKind;
  children: ReactNode;
}) {
  const inner = (
    <>
      <span className="px-button__label">{children}</span>
      <ButtonPet kind={pet} />
    </>
  );
  if (href !== undefined) {
    return (
      <a className="px-button px-button--primary guild-action" href={href}>
        {inner}
      </a>
    );
  }
  return (
    <button
      className="px-button px-button--primary guild-action"
      type="button"
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
    >
      {inner}
    </button>
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
  const townHref = `/play/${guild.id}`;
  const townReady = guild.connected && guild.synced;
  const pet = petForSeed(guild.id);

  if (guild.connected && guild.canManage) {
    const pending = syncState?.kind === 'pending';
    const syncLabel = pending
      ? guild.synced
        ? 'Syncing…'
        : 'Creating…'
      : guild.synced
        ? 'Sync now'
        : 'Create world';

    return (
      <div className="guild-actions">
        {townReady ? (
          <PrimaryCta href={townHref} pet={pet}>
            Enter town
            <span aria-hidden="true">→</span>
          </PrimaryCta>
        ) : (
          <PrimaryCta
            onClick={() => onSync(guild)}
            disabled={pending || refreshing}
            busy={pending}
            pet={pet}
          >
            {syncLabel}
          </PrimaryCta>
        )}
        {townReady ? (
          <button
            className="px-button px-button--ghost guild-sync-button"
            type="button"
            disabled={pending || refreshing}
            aria-busy={pending}
            onClick={() => onSync(guild)}
          >
            {syncLabel}
          </button>
        ) : null}
        {syncState?.kind === 'success' ? (
          <span className="guild-sync-feedback" role="status">
            {syncState.message}
          </span>
        ) : syncState?.kind === 'error' ? (
          <span className="guild-sync-feedback guild-sync-feedback--error" role="alert">
            {syncState.message}
          </span>
        ) : guild.synced && !townReady ? (
          <span className="guild-sync-feedback">Private snapshot ready</span>
        ) : null}
      </div>
    );
  }

  if (townReady) {
    return (
      <PrimaryCta href={townHref} pet={pet}>
        Enter town
        <span aria-hidden="true">→</span>
      </PrimaryCta>
    );
  }

  if (guild.worldUrl !== null) {
    return (
      <PrimaryCta href={guild.worldUrl} pet={pet}>
        Explore
        <span aria-hidden="true">→</span>
      </PrimaryCta>
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
