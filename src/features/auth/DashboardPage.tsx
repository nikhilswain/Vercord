import { useCallback, useEffect, useRef, useState } from 'react';

import { AppHeader } from '../../components/AppHeader';
import { ButtonPet } from '../../components/ButtonPet';
import { SceneBackdrop } from '../../components/SceneBackdrop';
import { SwipeDeck } from '../../components/SwipeDeck';
import {
  authSessionSchema,
  guildSyncResponseSchema,
  type AuthGuild,
  type AuthSession,
} from './session';
import { GuildPicker, type GuildSyncStates } from './GuildPicker';
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
        <a
          className="px-button px-button--primary discord-sign-in"
          href="/api/auth/discord/start?return_to=%2Fdashboard"
        >
          <span className="px-button__label">
            <DiscordIcon />
            Continue with Discord
          </span>
          <ButtonPet kind="cat" />
        </a>
        <p className="auth-scope-note">
          Dmap requests your Discord identity, server list, and your own membership details.
        </p>
      </section>
      <SwipeDeck
        images={[
          { src: '/screenshots/willowmere.png' },
          { src: '/screenshots/town-hall.png' },
          { src: '/screenshots/mosswild-forest.png' },
        ]}
        variant="fan"
        className="dashboard-gate-deck"
        decorative
      />
    </main>
  );
}

export function DashboardPage() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [syncStates, setSyncStates] = useState<GuildSyncStates>({});
  const syncControllers = useRef(new Map<string, AbortController>());
  const sessionController = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const authResult = new URLSearchParams(window.location.search).get('auth');
  const authMessage = authResult === null ? null : (authMessages[authResult] ?? null);

  const requestSession = useCallback((refresh = false) => {
    sessionController.current?.abort();
    const controller = new AbortController();
    sessionController.current = controller;
    void fetch(`/api/auth/session${refresh ? '?refresh=1' : ''}`, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return { kind: 'signed-out' } as const;
        if (!response.ok) throw new Error('Session unavailable');
        const parsed = authSessionSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('Invalid session');
        return { kind: 'ready', session: parsed.data } as const;
      })
      .then((nextState) => {
        if (controller.signal.aborted) return;
        setState(nextState);
        setSyncStates({});
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
        if (refresh)
          setRefreshError(
            'Could not refresh your servers. Your previous list is still here. Try again.',
          );
      })
      .finally(() => {
        if (sessionController.current === controller) {
          sessionController.current = null;
          setRefreshing(false);
        }
      });
    return () => controller.abort();
  }, []);

  const refreshSession = useCallback(() => {
    if (syncControllers.current.size > 0) return;
    setRefreshing(true);
    setRefreshError(null);
    return requestSession(true);
  }, [requestSession]);

  const loadSession = useCallback(() => {
    setState({ kind: 'loading' });
    return refreshSession();
  }, [refreshSession]);

  const syncGuild = useCallback((guild: AuthGuild) => {
    if (sessionController.current !== null || syncControllers.current.has(guild.id)) return;

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
        if (controller.signal.aborted) return;
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

        if (controller.signal.aborted) return;
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

  useEffect(() => requestSession(), [requestSession]);

  useEffect(() => {
    const controllers = syncControllers.current;
    document.title = 'Discord worlds — Dmap';
    return () => {
      sessionController.current?.abort();
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  return (
    <div className="page-shell app-shell pixel-page dashboard-page">
      <SceneBackdrop src="/screenshots/willowmere.png" variant="ambient" />
      <AppHeader
        context="Explore"
        status={<span>{state.kind === 'ready' ? 'Discord connected' : 'Account access'}</span>}
      />
      {state.kind === 'loading' ? (
        <main className="dashboard-main dashboard-loading" role="status">
          <span aria-hidden="true" />
          <p>Reading your Discord worlds…</p>
        </main>
      ) : state.kind === 'ready' ? (
        <GuildPicker
          session={state.session}
          syncStates={syncStates}
          onSync={syncGuild}
          refreshing={refreshing}
          refreshError={refreshError}
          onRefresh={refreshSession}
        />
      ) : state.kind === 'error' ? (
        <main className="dashboard-main dashboard-error" role="alert">
          <h1>Discord worlds are unavailable</h1>
          <p>Dmap could not load your session right now.</p>
          <button
            type="button"
            className="px-button px-button--primary dashboard-error-button"
            onClick={loadSession}
          >
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
