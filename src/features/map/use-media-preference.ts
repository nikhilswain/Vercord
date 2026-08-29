import { useCallback, useMemo, useSyncExternalStore } from 'react';

export function useMediaPreference(query: string): boolean {
  const mediaQuery = useMemo(() => matchMedia(query), [query]);
  const subscribe = useCallback(
    (publish: () => void) => {
      mediaQuery.addEventListener('change', publish);
      return () => mediaQuery.removeEventListener('change', publish);
    },
    [mediaQuery],
  );
  const getSnapshot = useCallback(() => mediaQuery.matches, [mediaQuery]);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
