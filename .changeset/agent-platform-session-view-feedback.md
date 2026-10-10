---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': patch
---

Rework the session view per product feedback.

- **Platform-standard header.** Inside the agent-platform shell the session
  page now uses the same `ShellPage` frame as All Sessions and Customize: a
  breadcrumb reading "Sessions / Session" and the session's name as the h1 at
  the standard title scale, with the state badge, agent and installation
  beside it. The in-content title (which doubled the shell's "Sessions"
  header at an odd size and position) is gone; classic chrome keeps its own
  layout.
- **Cost chip in the composer.** The cost/memory chip moved from the page
  header into the composer's controls, next to Send — always on screen with
  the docked box, as in the design. Its popover opens upward, drops the
  Agent row (the page is already that agent's session) and keeps a single
  explanatory sentence: the estimate's basis.
- **Share UI removed for now.** The portal has no way to open a shared
  session, so the Share button, dialog, hooks and client surface are gone,
  along with the `AgentPlatform.sessionShared` telemetry event. The backend's
  share routes stay for kagent-compatible clients and a future UI.
