---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': patch
---

Usage → Your sessions shows your actual model cost, as the gateway priced
it, instead of an estimate: in the totals strip ("Cost", "All your model
calls") and per agent. It covers every model call made as you, in your
sessions or not, and the tooltips say so. Where it cannot be read (kagent
names no one, the gateway records no user, none of your calls was priced, or
Mimir is down), the page falls back to the estimate, labelled "Est. cost",
with the reason. The description drops "Overview and Cost cover every user's
model calls."

The figure comes from a new route, `GET /api/agent-platform/usage/model-cost`,
which takes the person from kagent (`GetCurrentUser`, with their own token)
and builds the query itself, so no request can read anyone else's cost.
`MimirService` and `mimirServiceRef` move from gs-backend to gs-node, the
metric registry from gs to gs-common (`mimirMetrics.ts`, still re-exported
by gs), and `counterIncrease` to agent-platform-common.
