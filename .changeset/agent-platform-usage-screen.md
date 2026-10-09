---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

The Usage screen is rebuilt per the Agent Platform prototype, with the views
**Overview**, **Cost**, **Your sessions** and **Technical details**.

**Overview** opens with KPI tiles — spend this window with the change against
the previous window, tokens, your own session count, and the active agents —
followed by compact per-agent and per-model spend breakdowns. **Cost** carries
the cost-over-time chart and the full by-agent and by-model tables.
**Technical details** absorbs the raw gateway figures (token counts, model
calls, blended rate, cache share), the tokens-per-day chart, the gateway health
strip, and the connector tool-call section the muster plugin contributes —
`/agent-platform/usage/mcp` redirects there, and the view exists whether or not
muster contributed anything.

Two scope controls sit above the tab strip, both kept in the URL so they
survive a tab switch and travel in a shared link: a **time window**
(7/30/90 days, `?window=7d`) applying to the gateway views, and an
**Environment (installation) selector shown only when the portal knows more
than one installation**.

Costs follow the installation's configured display currency where one is set
(`gs.installations.<name>.currency`), USD otherwise. A converted amount is
labeled **estimated**; the gateway's measured USD figures and the
runtime-reported costs are never relabeled.

The kagent session-usage fan-out now also sums the **runtime-reported cost**
(`costUsd`, which the claude harness reports per turn), overall and per agent —
so Your sessions shows "Reported cost" beside the token-derived "Est. cost",
and an agent whose runtime reports none says "Not reported" rather than $0.

The tiles stack and the tables scroll at phone width (375px).
