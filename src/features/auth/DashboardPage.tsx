import { useCallback, useEffect, useRef, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import {
  authSessionSchema,
  guildSyncResponseSchema,
  type AuthGuild,
  type AuthSession,
} from './session';
import './dashboard.css';

type DashboardState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; session: AuthSession }
  | { kind: 'error' };

type GuildSyncState =
  { kind: 'pending' } | { kind: 'success'; message: string } | { kind: 'error'; message: string };

type GuildSyncStates = Record<string, GuildSyncState | undefined>;

const authMessages: Record<string, string> = {
  cancelled: 'Discord sign-in was cancelled.',
  failed: 'Discord sign-in did not finish. Try again.',
  invalid: 'That Discord sign-in link expired. Start again.',
  unavailable: 'Discord sign-in is not ready in this environment yet.',
};

function errorCodeFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const error = (payload as Record<string, unknown>).error;
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}

function syncErrorMessage(code: string | null, status: number): string {
  if (code === 'BOT_NOT_CONNECTED') return 'The Dmap bot is no longer connected. Refresh the page.';
  if (code === 'SYNC_IN_PROGRESS') return 'This server is already syncing.';
  if (code === 'SUSPICIOUS_EMPTY_SNAPSHOT') {
    return 'Discord returned an empty server, so the existing world was kept.';
  }
  if (status === 403) return 'Your server permission changed. Refresh and try again.';
  if (status === 502 || status === 503 || status === 504) {
    return 'Discord could not be reached. Try again in a moment.';
  }
  return 'World sync failed. Try again.';
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.1 7.2a13 13 0 0 1 7.8 0l.8-1.5a14 14 0 0 1 3.6 1.8c1.5 2.2 2.3 4.7 2.1 7.3a14 14 0 0 1-4.4 2.7l-1.1-1.6c.6-.2 1.2-.5 1.8-.9-3.4 1.6-10 1.6-13.4 0 .6.4 1.2.7 1.8.9L6 17.5a14 14 0 0 1-4.4-2.7c-.2-2.6.6-5.1 2.1-7.3a14 14 0 0 1 3.6-1.8l.8 1.5Zm.2 6.9c1 0 1.8-.9 1.8-2s-.8-2-1.8-2-1.8.9-1.8 2 .8 2 1.8 2Zm7.4 0c1 0 1.8-.9 1.8-2s-.8-2-1.8-2-1.8.9-1.8 2 .8 2 1.8 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GuildMark({ guild }: { guild: AuthGuild }) {
  if (guild.iconUrl !== null) {
    return <img className="guild-mark" src={guild.iconUrl} alt="" width="54" height="54" />;
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

function GuildAction({
  guild,
  onSync,
  syncState,
}: {
  guild: AuthGuild;
  onSync(guild: AuthGuild): void;
  syncState: GuildSyncState | undefined;
}) {
  if (guild.worldUrl !== null && (!guild.connected || !guild.canManage)) {
    return (
      <a className="guild-action" href={guild.worldUrl}>
        Open world
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
            Open world
            <span aria-hidden="true">→</span>
          </a>
        ) : null}
        <button
          className={guild.worldUrl === null ? 'guild-action' : 'guild-sync-button'}
          type="button"
          disabled={pending}
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

function SignedOut({ message }: { message: string | null }) {
  return (
    <main className="dashboard-main dashboard-gate">
      <section className="dashboard-gate-copy" aria-labelledby="discord-sign-in-title">
        <p className="dashboard-route">Discord world access</p>
        <h1 id="discord-sign-in-title">Choose the server you want to explore.</h1>
        <p>
          Sign in to see your Discord servers and identify the worlds Dmap can build. Messages are
          never requested.
        </p>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        <a className="discord-sign-in" href="/api/auth/discord/start?return_to=%2Fdashboard">
          <DiscordIcon />
          Continue with Discord
        </a>
        <p className="auth-scope-note">
          Dmap requests your Discord identity, server list, and your own membership details.
        </p>
      </section>
      <div className="dashboard-gate-map" aria-hidden="true">
        <span className="gate-route gate-route--one" />
        <span className="gate-route gate-route--two" />
        <span className="gate-node gate-node--one">A</span>
        <span className="gate-node gate-node--two">W</span>
        <span className="gate-node gate-node--three">C</span>
      </div>
    </main>
  );
}

function GuildPicker({
  onSync,
  session,
  syncStates,
}: {
  onSync(guild: AuthGuild): void;
  session: AuthSession;
  syncStates: GuildSyncStates;
}) {
  const manageableCount = session.guilds.filter((guild) => guild.canManage).length;
  const connectedCount = session.guilds.filter((guild) => guild.connected).length;

  return (
    <main className="dashboard-main guild-picker">
      <section className="guild-picker-heading" aria-labelledby="guild-picker-title">
        <div>
          <p className="dashboard-route">Your Discord worlds</p>
          <h1 id="guild-picker-title">Pick a server.</h1>
          <p>
            Dmap can manage {manageableCount} of {session.guilds.length}{' '}
            {session.guilds.length === 1 ? 'server' : 'servers'} in your account.
          </p>
        </div>
        <div className="signed-in-user">
          {session.user.avatarUrl !== null ? (
            <img src={session.user.avatarUrl} alt="" width="44" height="44" />
          ) : (
            <span aria-hidden="true">{session.user.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <div>
            <strong>{session.user.displayName}</strong>
            <small>@{session.user.username}</small>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </section>

      <div className="guild-connection-summary" role="status">
        <span className={connectedCount > 0 ? 'is-connected' : undefined} aria-hidden="true" />
        {connectedCount > 0
          ? `${connectedCount} Discord ${connectedCount === 1 ? 'world is' : 'worlds are'} connected`
          : 'No Dmap bot connection found in your servers'}
      </div>

      {session.guilds.length === 0 ? (
        <section className="guild-empty">
          <h2>No Discord servers found</h2>
          <p>Join or create a server in Discord, then return here.</p>
        </section>
      ) : (
        <ul className="guild-list" aria-label="Discord servers">
          {session.guilds.map((guild) => (
            <li
              className={guild.connected ? 'guild-row guild-row--connected' : 'guild-row'}
              key={guild.id}
            >
              <GuildMark guild={guild} />
              <div className="guild-identity">
                <div className="guild-title-line">
                  <h2>{guild.name}</h2>
                  {guild.connected ? <span className="guild-badge">Connected</span> : null}
                </div>
                <p>
                  {guild.owner ? 'Server owner' : guild.canManage ? 'Can manage server' : 'Member'}
                  {guild.synced ? ' · Map synced' : ''}
                  {guild.published ? ' · Public world live' : ''}
                </p>
              </div>
              <GuildAction guild={guild} onSync={onSync} syncState={syncStates[guild.id]} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [syncStates, setSyncStates] = useState<GuildSyncStates>({});
  const syncControllers = useRef(new Map<string, AbortController>());
  const authResult = new URLSearchParams(window.location.search).get('auth');
  const authMessage = authResult === null ? null : (authMessages[authResult] ?? null);

  const loadSession = useCallback(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void fetch('/api/auth/session', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return { kind: 'signed-out' } as const;
        if (!response.ok) return { kind: 'error' } as const;
        const parsed = authSessionSchema.safeParse(await response.json());
        return parsed.success
          ? ({ kind: 'ready', session: parsed.data } as const)
          : ({ kind: 'error' } as const);
      })
      .then((nextState) => {
        if (!controller.signal.aborted) setState(nextState);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, []);

  const syncGuild = useCallback((guild: AuthGuild) => {
    if (syncControllers.current.has(guild.id)) return;

    const controller = new AbortController();
    syncControllers.current.set(guild.id, controller);
    setSyncStates((current) => ({ ...current, [guild.id]: { kind: 'pending' } }));

    void fetch(`/api/auth/guilds/${encodeURIComponent(guild.id)}/sync`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          setState({ kind: 'signed-out' });
          return;
        }

        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setSyncStates((current) => ({
            ...current,
            [guild.id]: {
              kind: 'error',
              message: syncErrorMessage(errorCodeFromPayload(payload), response.status),
            },
          }));
          return;
        }

        const parsed = guildSyncResponseSchema.safeParse(payload);
        if (!parsed.success || parsed.data.guildId !== guild.id) {
          setSyncStates((current) => ({
            ...current,
            [guild.id]: { kind: 'error', message: 'World sync returned an invalid response.' },
          }));
          return;
        }

        setState((current) =>
          current.kind === 'ready'
            ? {
                kind: 'ready',
                session: {
                  ...current.session,
                  guilds: current.session.guilds.map((candidate) =>
                    candidate.id === guild.id
                      ? {
                          ...candidate,
                          synced: true,
                          worldUrl: parsed.data.worldUrl ?? candidate.worldUrl,
                        }
                      : candidate,
                  ),
                },
              }
            : current,
        );
        setSyncStates((current) => ({
          ...current,
          [guild.id]: {
            kind: 'success',
            message: `${parsed.data.categoryCount} categories · ${parsed.data.channelCount} channels synced`,
          },
        }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSyncStates((current) => ({
          ...current,
          [guild.id]: { kind: 'error', message: 'Could not reach Dmap. Try again.' },
        }));
      })
      .finally(() => {
        if (syncControllers.current.get(guild.id) === controller) {
          syncControllers.current.delete(guild.id);
        }
      });
  }, []);

  useEffect(() => loadSession(), [loadSession]);

  useEffect(() => {
    document.title = 'Discord worlds — Dmap';
    return () => {
      for (const controller of syncControllers.current.values()) controller.abort();
      syncControllers.current.clear();
    };
  }, []);

  return (
    <div className="page-shell app-shell dashboard-page">
      <AppHeader
        context="World switcher"
        status={<span>{state.kind === 'ready' ? 'Discord connected' : 'Account access'}</span>}
      />
      {state.kind === 'loading' ? (
        <main className="dashboard-main dashboard-loading" role="status">
          <span aria-hidden="true" />
          <p>Reading your Discord worlds…</p>
        </main>
      ) : state.kind === 'ready' ? (
        <GuildPicker session={state.session} syncStates={syncStates} onSync={syncGuild} />
      ) : state.kind === 'error' ? (
        <main className="dashboard-main dashboard-error" role="alert">
          <h1>Discord worlds are unavailable</h1>
          <p>Dmap could not load your session right now.</p>
          <button type="button" onClick={loadSession}>
            Try again
          </button>
        </main>
      ) : (
        <SignedOut message={authMessage} />
      )}
      <footer className="site-footer">Your Discord access stays server-side.</footer>
    </div>
  );
}
