import { createContext, ReactNode, useContext } from 'react';

/**
 * Which clock `DateComponent` shows: `utc`, the portal's long-standing
 * convention ("11 Oct 2026, 15:50 UTC"), or `local`, the browser's time zone
 * ("11 Oct 2026, 17:50", the full timestamp with its zone on hover).
 */
export type DateTimeZone = 'utc' | 'local';

const DateTimeZoneContext = createContext<DateTimeZone>('utc');

/**
 * Sets the clock for every `DateComponent` below it. Without one, dates are
 * UTC, so a page that mounts none renders exactly as before.
 *
 * The agent-platform shell mounts `local` around its pages, so its lists
 * (which group by the local day) and its detail pages tell one event's time
 * on one clock.
 */
export function DateTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone: DateTimeZone;
  children?: ReactNode;
}) {
  return (
    <DateTimeZoneContext.Provider value={timeZone}>
      {children}
    </DateTimeZoneContext.Provider>
  );
}

/** The clock dates render in here; `utc` outside any provider. */
export function useDateTimeZone(): DateTimeZone {
  return useContext(DateTimeZoneContext);
}
