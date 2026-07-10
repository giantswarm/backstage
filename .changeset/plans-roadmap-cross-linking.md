---
'@giantswarm/backstage-plugin-plans-backend': minor
'@giantswarm/backstage-plugin-roadmap-backend': minor
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-roadmap': minor
---

Cross-link plans with the roadmap epics they implement, via the
`**Epic:** [owner/repo#N](url)` PRD header convention.

- plans-backend: new `GET /epics` endpoint parsing the Epic header out of
  merged plan documents (default branch) and open plan PRs (diff additions),
  cached for five minutes.
- roadmap-backend: new `GET /items/by-issue/:owner/:repo/:number` endpoint
  resolving a GitHub issue reference to its Projects v2 board item.
- plans frontend: merged plans and open plan PRs show an epic chip with the
  epic's board Status, linking to the roadmap item detail view (GitHub issue
  fallback when the roadmap plugin is not deployed). The selected merged plan
  now lives in `?plan=`, so plans are deep-linkable.
- roadmap frontend: the epic detail sidebar links back to the plan(s)
  referencing the epic -- merged plans and open plan PRs ("proposed in
  owner/repo#N") across all configured plan repositories.
