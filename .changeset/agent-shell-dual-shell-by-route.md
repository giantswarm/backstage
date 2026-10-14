---
'app': minor
---

Make the agent shell and the classic portal coexist in one app, chosen by URL.
The `agent-platform-shell` feature flag now only gates the shell's
availability; which chrome renders is decided per location at render time:

- With the flag on, the agent area (`/`, `/agent-platform/**`, `/customize/**`)
  renders the new shell — rail navigation and the agent theme (`data-agent-shell`
  CSS overrides and the agent MUI palette) — while every other route
  (`/clusters`, `/catalog`, `/deployments`, `/settings`, …) keeps the classic
  sidebar and classic theme, so the old portal stays fully usable. Deep links
  and "open in new tab" pick the right shell from the URL alone.
- With the flag off, nothing changes: the app behaves exactly as before,
  classic everywhere.
- Cross-links between the two shells, each opening in a new tab: the rail
  gains a "Platform Portal" entry linking to `/clusters`, and the classic
  sidebar — while the flag is on — replaces its in-place Agent Platform entry
  with an "Agent Platform" link to the shell's home at `/`.
