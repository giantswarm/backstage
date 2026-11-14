# Dates and times

Event timestamps use the browser's locale and local time zone. Use the
`ui-react` local-date helpers rather than inline `toLocale*` calls. Exact
values include the calendar date, year, seconds and time zone.

`DateComponent` renders event dates and relative ages. Ordinary ages refresh
every minute while mounted, including ages older than 45 minutes. A visible
tab refreshes immediately. A list can pass its shared `now` to avoid a timer
per row; absolute, absent and invalid dates do not subscribe.

Use `disclosure` on standalone timestamps to reveal the exact value through
`InfoHint`. In linked rows, put the hint outside the link. Reuse an existing
accessible details surface when it already exposes the timestamp. Hover
alone does not provide keyboard or touch access.

Reporting-day labels use `agent-platform-common` UTC helpers and say UTC.
Do not shift UTC-midnight bucket keys into local calendar days. Session
lists group events by local day. Rolling windows and UTC calendar-month
counts describe different periods and retain explicit labels.

Relative wording remains English with the application. Lifecycle progress
uses compact elapsed durations from the shared duration formatter. Missing
source timestamps are omitted. Unparsable timestamps retain the existing
fallback of displaying the input.

## Inventory reconciliation

| Original inventory concern         | Implementation                                                              |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Session, palette and cache formats | Shared local helpers; cache ages use `DateComponent`                        |
| Created/connection times           | Existing relative `DateComponent`; exact-time access uses shared disclosure |
| Egress and deletion clocks         | Shared minute/second clock helpers                                          |
| Workflow and connector chart days  | Shared UTC calendar-day helpers                                             |
| Hourly connector chart             | Shared local clocks; exact tooltip includes date and zone                   |
| Relative refresh                   | Shared `useNow`, no age cutoff; existing inbox/lifecycle cadence retained   |
| Exact times                        | Existing `InfoHint`, with controls outside row links                        |
| Durations and time windows         | Existing shared formatters from the previously merged slices                |
| Heatmap                            | Localized weekday labels, shared full UTC day descriptions                  |
| Classic portal                     | Existing UTC date output retained                                           |

Browser and deployment validation must be recorded on the linked pull
requests before the inventory issue is closed.

Turn markers retain absolute dates: sessions can span calendar days, so a
clock-only marker would lose context. Local event formatting and reporting
bucket formatting share locale conventions but have separate time-zone
semantics.
