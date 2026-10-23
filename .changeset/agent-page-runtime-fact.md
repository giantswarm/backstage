---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

Agents: the facts beside an agent's overview name its Runtime in the create
form's words: the Harness's title, Platform default on the platform Harness,
and its name and image beneath, with an info hint saying what the runtime is.
A Harness you cannot read is shown by its name, and an agent whose runtime is
not known reads Unknown runtime. The review steps of creating and editing an
agent, and the More options summary, name the platform Harness by the same
title and mark instead of "Standard". The cards under Customize → Agents'
"Last used by you" open the agent's page, like every other item of the list,
instead of starting a session, and keep an agent that cannot start one now;
the page's Use this agent starts one. `Agent.hasInlineHarness()` tells an
inline Harness apart from none.
