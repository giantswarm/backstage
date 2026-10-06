import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { HiveWhen, ItemTarget, whenFromParam } from '../lib/frontPage';

/**
 * The query parameters of what the front page opens in place: an epic's
 * pane (`?item=`), a plan's review overlay (`?pr=`, `?repo=`, the document
 * in `?file=`) and a knowledge document's pane (`?doc=`). One at a time.
 */
const DETAIL_PARAMS = ['item', 'pr', 'repo', 'file', 'doc'] as const;

/** The front page's moment, in `?when=`; now when the link names none. */
export function useHiveWhen(): [HiveWhen, (when: HiveWhen) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const setWhen = useCallback(
    (next: HiveWhen) =>
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          params.set('when', next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return [whenFromParam(searchParams.get('when')), setWhen];
}

function withDetail(
  search: URLSearchParams,
  detail: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams(search);
  DETAIL_PARAMS.forEach(key => params.delete(key));
  Object.entries(detail).forEach(([key, value]) => params.set(key, value));
  return params;
}

/**
 * Links that open a detail over the page the reader is on: the same path,
 * its moment, team and search kept, so the link is shareable and closing
 * the detail returns to the same place.
 */
export function useHiveDetailLinks() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const link = useCallback(
    (detail: Record<string, string>) =>
      `${pathname}?${withDetail(searchParams, detail).toString()}`,
    [pathname, searchParams],
  );

  return {
    /** Where an item leads: its pane, its review, or out of the portal. */
    itemHref: useCallback(
      (target: ItemTarget) => {
        switch (target.kind) {
          case 'item':
            return link({ item: target.id });
          case 'pr':
            return link({ pr: String(target.number), repo: target.repo });
          default:
            return target.url;
        }
      },
      [link],
    ),
    docHref: useCallback((path: string) => link({ doc: path }), [link]),
  };
}

/** The open detail, and closing it (Escape, the close button). */
export function useHiveDetail() {
  const [searchParams, setSearchParams] = useSearchParams();
  const close = useCallback(
    () => setSearchParams(prev => withDetail(prev, {})),
    [setSearchParams],
  );
  const pr = Number(searchParams.get('pr'));
  return {
    item: searchParams.get('item') ?? undefined,
    pull:
      Number.isInteger(pr) && pr > 0
        ? { number: pr, repo: searchParams.get('repo') ?? undefined }
        : undefined,
    doc: searchParams.get('doc') ?? undefined,
    close,
  };
}
