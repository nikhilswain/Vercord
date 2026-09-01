import { useCallback, useEffect, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import { authSessionSchema, type AuthGuild, type AuthSession } from './session';
import './dashboard.css';

type DashboardState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; session: AuthSession }
  | { kind: 'error' };

const authMessages: Record<string, string> = {
  cancelled: 'Discord sign-in was cancelled.',
  failed: 'Discord sign-in did not finish. Try again.',
  invalid: 'That Discord sign-in link expired. Start again.',
  unavailable: 'Discord sign-in is not ready in this environment yet.',
};

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

function GuildAction({ guild }: { guild: AuthGuild }) {
  if (guild.worldUrl !== null) {
    return (
      <a className="guild-action" href={guild.worldUrl}>
        Open world
        <span aria-hidden="true">→</span>
      </a>
    );
  }
  if (guild.connected && !guild.synced) {
    return <span className="guild-action-note">Waiting for first sync</span>;
  }
  if (guild.connected && guild.synced && !guild.published) {
    return (
      <span className="guild-action-note">
        {guild.canManage ? 'Private preview available locally' : 'No public world yet'}
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

function GuildPicker({ session }: { session: AuthSession }) {
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
              <GuildAction guild={guild} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
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

  useEffect(() => loadSession(), [loadSession]);

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
        <GuildPicker session={state.session} />
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
