---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Write every duration in the Agent Platform the same way, through the shared
`formatSeconds`: `420 ms` below a second, `1.2 s` below 10 s, `18 s` up to a
minute, then `2 min 30 s`, `12 min` and `1 h 5 min`.

- A fast try of a served model reads `200 as you in 420 ms`, not `in 0 s`.
- A workflow's average and longest run read `5 min`, not `300 s`.
- A tool or workflow run's result reads `5.3 s`, as the flow does, not
  `5321 ms`.
- A starting model reads `Starting on <node> for 4 min 30 s`, not a floored
  `for 4 min` or `for 0 min`.
- Latencies (p50, p95) above a minute read in minutes.

`formatSeconds` in `agent-platform-common` now goes on to minutes and hours;
muster's `formatDuration` and the second `formatSeconds` in agent-platform's
`lifecycle.ts` are gone.
