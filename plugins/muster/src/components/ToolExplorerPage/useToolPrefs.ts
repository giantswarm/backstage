import { useCallback, useState } from 'react';

/** How many recently-opened tools to remember per installation. */
const MAX_RECENTS = 8;

function key(kind: 'fav' | 'recent', installation: string | undefined): string {
  return `muster-tool-${kind}:${installation ?? 'default'}`;
}

function load(k: string): string[] {
  try {
    const raw = window.localStorage.getItem(k);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function save(k: string, list: string[]) {
  try {
    window.localStorage.setItem(k, JSON.stringify(list));
  } catch {
    // localStorage may be unavailable; prefs are best-effort.
  }
}

export interface ToolPrefs {
  favourites: string[];
  recents: string[];
  isFavourite: (name: string) => boolean;
  toggleFavourite: (name: string) => void;
  pushRecent: (name: string) => void;
}

/**
 * Per-installation favourites and recently-opened tools, persisted in
 * localStorage. Drives the explorer's quick-access sections so the tools a user
 * keeps reaching for are one click away.
 */
export function useToolPrefs(installation: string | undefined): ToolPrefs {
  const favKey = key('fav', installation);
  const recentKey = key('recent', installation);
  const [favourites, setFavourites] = useState<string[]>(() => load(favKey));
  const [recents, setRecents] = useState<string[]>(() => load(recentKey));

  const toggleFavourite = useCallback(
    (name: string) => {
      setFavourites(prev => {
        const next = prev.includes(name)
          ? prev.filter(n => n !== name)
          : [...prev, name];
        save(favKey, next);
        return next;
      });
    },
    [favKey],
  );

  const pushRecent = useCallback(
    (name: string) => {
      setRecents(prev => {
        const next = [name, ...prev.filter(n => n !== name)].slice(
          0,
          MAX_RECENTS,
        );
        save(recentKey, next);
        return next;
      });
    },
    [recentKey],
  );

  const isFavourite = useCallback(
    (name: string) => favourites.includes(name),
    [favourites],
  );

  return { favourites, recents, isFavourite, toggleFavourite, pushRecent };
}
