import type { AuthSession } from '../../src/features/auth/session';

const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1_000;
const MAX_DASHBOARD_CACHE_ENTRIES = 128;

/** Only browser-safe list projections live here. Every read follows session validation. */
export function createDashboardCache() {
  const entries = new Map<string, { expiresAt: number; session: AuthSession }>();
  let generation = 0;
  return {
    get generation() {
      return generation;
    },
    read(key: string, now = Date.now()): AuthSession | null {
      const entry = entries.get(key);
      if (entry === undefined) return null;
      if (entry.expiresAt <= now) {
        entries.delete(key);
        return null;
      }
      return entry.session;
    },
    write(key: string, session: AuthSession, expectedGeneration: number, now = Date.now()) {
      // A sync/logout that completed while this request was loading must win.
      if (generation !== expectedGeneration) return;
      entries.delete(key);
      for (const [candidate, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(candidate);
      }
      if (entries.size >= MAX_DASHBOARD_CACHE_ENTRIES) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
      entries.set(key, { expiresAt: now + DASHBOARD_CACHE_TTL_MS, session });
    },
    invalidateSession(idHash: string) {
      generation += 1;
      for (const key of entries.keys()) {
        if (key.startsWith(`${idHash}:`)) entries.delete(key);
      }
    },
    invalidateGuild(guildId: string) {
      generation += 1;
      for (const [key, entry] of entries) {
        if (entry.session.guilds.some((guild) => guild.id === guildId)) entries.delete(key);
      }
    },
  };
}

export const dashboardCache = createDashboardCache();
