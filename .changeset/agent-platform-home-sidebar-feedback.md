---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Implement the home and sidebar product feedback.

- **New-session view centered, agent-first.** The home screen's greeting and
  composer now sit vertically and horizontally centered in the content area
  (clearing the mobile bottom bar via `--agent-shell-mobile-bar-height`). The
  model chip is gone from the composer — the model stays the agent detail
  page's information. Choosing the agent is unmistakably the first step, as
  in the prototype: until one is chosen the picker carries an accent ring and
  "Required to start", while the prompt field ("Then type your message
  here.") and Start are disabled. `NewSessionComposer` grew an opt-in
  `agentFirst` prop for this; every preselected path — a `defaultAgent`, a
  sole agent, the dialogs, the palette, Evaluate and the assist panel — is
  unaffected.
- **Sidebar picks up new sessions immediately.** Starting a session now
  invalidates the installation's sessions list and session states with an
  active refetch (from `useCreateSession`'s `onSuccess`), so the shell rail's
  history — which stays mounted through the navigation — shows the new
  session at once instead of waiting out its poll interval.
- **Status dots instead of the "Needs you" pill.** The rail's session rows
  mark state the way Claude does: a small orange dot for a session waiting on
  the person ("Needs your input" as tooltip and accessible name), the blue
  dot for a working agent ("Working"). The pill is gone; a waiting session's
  title stays bold.
