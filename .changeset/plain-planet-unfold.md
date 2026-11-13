---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

`ui-react` exports `formatLocalTime` (`14:05`) and `formatLocalDay` (`16 Oct`, with the year when it is not the current one), the compact forms of `formatLocalDate`. The session list's last-active time and the command palette's session date use them, so they read on the same 24-hour clock and in the same words as every other date in the Agent Platform, whatever the browser's locale; the palette now shows the year of a session from another year. A model cache claim's creation shows as a relative date: "2 months ago" in a "Created" column on Model cache, with the local date and time on hover, and "created 2 months ago" in the add-pool cache note.
