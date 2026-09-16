import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GuildAction, GuildMark } from './GuildAction';
import type { AuthGuild, AuthSession } from './session';

export type GuildSyncState =
  { kind: 'pending' } | { kind: 'success'; message: string } | { kind: 'error'; message: string };
export type GuildSyncStates = Record<string, GuildSyncState | undefined>;

type GuildFilter = 'all' | 'ready' | 'manage';
const PAGE_SIZE = 18;
const FILTER_LABELS: Record<GuildFilter, string> = {
  all: 'All servers',
  ready: 'Ready to explore',
  manage: 'You manage',
};

function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const filter = params.get('filter');
  return {
    query: params.get('q') ?? '',
    filter: filter === 'ready' || filter === 'manage' ? filter : ('all' as GuildFilter),
  };
}

function JourneyMap() {
  return (
    <svg className="journey-map" viewBox="0 0 420 230" aria-hidden="true">
      <path
        className="journey-terrain"
        d="m50 46 55-19 40 24 61-13 40 25 64-7 49 42-13 45-66 26-17 29-63-5-38-28-64 10-31-41-28-32Z"
      />
      <path
        className="journey-contour"
        d="m67 58 37-14 40 26 62-14 37 28 59-9 37 26-11 30-61 23-22 27-39-2-41-31-62 10-24-29-22-36Z"
      />
      <path className="journey-river" d="M171 40q-15 35 12 66t-6 77" />
      <path className="journey-trail" d="m113 116 38 23 48-41 79 13 31-20" />
      <g className="journey-trees">
        <path d="m73 82 9-17 9 17h-6v9h-6v-9Zm40-26 9-17 9 17h-6v9h-6v-9Zm8 107 9-17 9 17h-6v9h-6v-9Zm110-87 9-17 9 17h-6v9h-6v-9Zm53 75 9-17 9 17h-6v9h-6v-9Zm28-22 9-17 9 17h-6v9h-6v-9Z" />
      </g>
      <g className="journey-village">
        <path d="m95 116 18-16 18 16m-30-5v25h24v-25m-16 25v-14h8v14M184 92l16-14 16 14m-26-8v27h20V84m-14 27V99h8v12" />
        <circle cx="281" cy="110" r="14" />
        <path d="m275 115 6-15 6 15-6-3Z" />
      </g>
      <path className="journey-compass" d="M373 26v31m-15-15h30m-15-12 4 12-4 11-4-11Z" />
    </svg>
  );
}

export function GuildPicker({
  onSync,
  session,
  syncStates,
  onRefresh,
  refreshing,
  refreshError,
}: {
  onSync(guild: AuthGuild): void;
  session: AuthSession;
  syncStates: GuildSyncStates;
  onRefresh(): void;
  refreshing: boolean;
  refreshError: string | null;
}) {
  const [filters, setFilters] = useState(readFilters);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const counts = {
    all: session.guilds.length,
    ready: session.guilds.filter((guild) => guild.worldUrl !== null).length,
    manage: session.guilds.filter((guild) => guild.canManage).length,
  };
  const filteredGuilds = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    return session.guilds.filter(
      (guild) =>
        guild.name.toLocaleLowerCase().includes(query) &&
        (filters.filter === 'all' ||
          (filters.filter === 'ready' ? guild.worldUrl !== null : guild.canManage)),
    );
  }, [filters, session.guilds]);
  const hasMore = visibleCount < filteredGuilds.length;
  const loadMore = useCallback(() => {
    setVisibleCount((current) => current + PAGE_SIZE);
  }, []);

  function updateFilters(next: typeof filters) {
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
    const url = new URL(window.location.href);
    if (next.query) url.searchParams.set('q', next.query);
    else url.searchParams.delete('q');
    if (next.filter !== 'all') url.searchParams.set('filter', next.filter);
    else url.searchParams.delete('filter');
    window.history.replaceState(window.history.state, '', url);
  }

  useEffect(() => {
    const onPopState = () => {
      setFilters(readFilters());
      setVisibleCount(PAGE_SIZE);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!hasMore || target === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadMore();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, visibleCount, filters]);

  return (
    <main className="dashboard-main guild-picker">
      <section className="guild-picker-heading" aria-labelledby="guild-picker-title">
        <div>
          <p className="dashboard-route">The traveler's atlas</p>
          <h1 id="guild-picker-title">Where to next?</h1>
          <p>Your communities, a world apart. Choose one to explore.</p>
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
          <form action="/api/auth/logout" method="post" noValidate>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </section>

      <section className="dashboard-expedition" aria-labelledby="expedition-title">
        <div className="expedition-copy">
          <p className="dashboard-route">A little adventure, close to home</p>
          <h2 id="expedition-title">Take the forest path.</h2>
          <p>Visit Willowmere, wander the jungle, and uncover the temple's story.</p>
          <a href="/play/demo" className="expedition-link">
            Explore the demo <span aria-hidden="true">↗</span>
          </a>
        </div>
        <JourneyMap />
        <span className="expedition-note">Willowmere · Demo world</span>
      </section>

      <section className="guild-directory" aria-labelledby="guild-directory-title">
        <div className="guild-directory-heading">
          <div>
            <h2 id="guild-directory-title">Your worlds</h2>
            <p>
              {counts.ready} ready to explore <span aria-hidden="true">·</span> {counts.all} Discord
              servers
            </p>
          </div>
          <button
            type="button"
            className="guild-refresh"
            onClick={onRefresh}
            disabled={
              refreshing || Object.values(syncStates).some((state) => state?.kind === 'pending')
            }
            aria-busy={refreshing}
          >
            <span aria-hidden="true">↻</span> {refreshing ? 'Refreshing…' : 'Refresh servers'}
          </button>
        </div>
        <div className="guild-directory-tools">
          <div className="guild-filters" role="group" aria-label="Filter servers">
            {(Object.keys(FILTER_LABELS) as GuildFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={filters.filter === filter}
                onClick={() => updateFilters({ ...filters, filter })}
              >
                {FILTER_LABELS[filter]} <span>{counts[filter]}</span>
              </button>
            ))}
          </div>
          <label className="guild-search">
            <span className="sr-only">Search servers</span>
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              type="search"
              placeholder="Find a server…"
              value={filters.query}
              maxLength={100}
              onChange={(event) => updateFilters({ ...filters, query: event.target.value })}
            />
          </label>
        </div>
        {refreshError !== null ? (
          <p className="guild-refresh-error" role="alert">
            {refreshError}
          </p>
        ) : null}

        {filteredGuilds.length === 0 ? (
          <div className="guild-empty" role="status">
            <h3>{counts.all === 0 ? 'Your atlas is waiting.' : 'No servers on this path.'}</h3>
            <p>
              {counts.all === 0
                ? 'Join or create a server in Discord, then refresh your servers here.'
                : 'Try another name, or show all your servers.'}
            </p>
            {counts.all > 0 ? (
              <button
                type="button"
                className="guild-refresh"
                onClick={() => updateFilters({ query: '', filter: 'all' })}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="guild-list" aria-label="Discord servers">
            {filteredGuilds.slice(0, visibleCount).map((guild) => (
              <li
                className={guild.worldUrl !== null ? 'guild-card guild-card--ready' : 'guild-card'}
                key={guild.id}
              >
                <div className="guild-card-heading">
                  <GuildMark guild={guild} />
                  <span
                    className={
                      guild.worldUrl !== null ? 'guild-badge guild-badge--ready' : 'guild-badge'
                    }
                  >
                    {guild.worldUrl !== null
                      ? 'World ready'
                      : guild.connected
                        ? 'Connected'
                        : 'Not connected'}
                  </span>
                </div>
                <div className="guild-identity">
                  <h3>{guild.name}</h3>
                  <p>
                    {guild.owner ? 'Server owner' : guild.canManage ? 'Server manager' : 'Member'}
                    {guild.published ? ' · Public world' : ''}
                  </p>
                </div>
                <div className="guild-card-footer">
                  {guild.connected && guild.synced ? (
                    <a className="guild-town-link" href={`/play/${guild.id}`}>
                      Enter town <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                  <GuildAction
                    guild={guild}
                    onSync={onSync}
                    syncState={syncStates[guild.id]}
                    refreshing={refreshing}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="guild-list-end" ref={loadMoreRef}>
          <p role="status">
            Showing {Math.min(visibleCount, filteredGuilds.length)} of {filteredGuilds.length}{' '}
            {filteredGuilds.length === 1 ? 'server' : 'servers'}
          </p>
          {hasMore ? (
            <button type="button" className="guild-refresh" onClick={loadMore}>
              Show more servers
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
