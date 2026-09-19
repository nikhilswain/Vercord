import { AdventureJourney } from '../adventure/journey';

/** Local exploration progress until authoritative account progression is introduced.
 * Isolated by member + world; never uploaded as trusted multiplayer state.
 */
export function createForestJourney(scope: string): AdventureJourney {
  const key = `dmap:forest-journey:v1:${scope}`;
  let snapshot: unknown;
  try {
    const json = localStorage.getItem(key);
    if (json && json.length <= 1_000_000) snapshot = JSON.parse(json) as unknown;
  } catch {
    /* Private browsing can disable storage; the visit still works in memory. */
  }
  return new AdventureJourney({
    snapshot,
    persist(value) {
      try {
        const json = JSON.stringify(value);
        if (json.length > 1_000_000) return false;
        localStorage.setItem(key, json);
      } catch {
        return false;
      }
      return true;
    },
  });
}
