---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

Replace the Agent Platform's "Usage" tab with a **"Dashboards"** tab
(`/agent-platform/dashboards`) that organises the platform's metrics and signals
into one dashboard per domain, and move muster's overview into it.

- The tab sits **last in the row** (Agents · Sessions · Models · MCP Servers ·
  Dashboards). That order is pinned in `app-config.yaml`'s `app.extensions`,
  because a tab attached from another plugin (muster's "MCP Servers") always
  lands after every tab its host declares — so declaration order alone cannot
  put Dashboards behind it.
- **Agents** (`/dashboards/agents`) and **MCP** (`/dashboards/mcp`) are now
  sub-tabs rather than two sections stacked on one page. That stacking is what
  forced the old page's scope-neutral "Usage" heading: the personal section's
  heading ("Your agent usage") was the topmost one in the content, so it read as
  scoping the installation-wide MCP numbers below it, which are every caller's.
  Each dashboard is alone on its own tab now, so its own heading is the top of
  its content and states its scope and window.
- The **MCP Servers tab loses its "Dashboard" view**: the aggregator's endpoint
  and session state, inventory, health, capability surface, fleet coverage and
  provenance moved onto the MCP dashboard, joining the tool-call metrics that
  already lived on the Usage page. So there is one place to find out how the
  platform is doing, and the MCP Servers tab is what its name says — the
  servers, workflows and tools themselves. That tab's index now opens on
  Servers, and `/agent-platform/muster/dashboard` and
  `/agent-platform/muster/usage` both redirect to `/agent-platform/dashboards/mcp`,
  preserving the query string.
- The moved view's `Browse` cards are **gone**: as a landing page for the MCP
  Servers tab they were navigation, on a dashboard they duplicated the tab strip
  two rows up.
- Sessions and Models deliberately get no dashboard of their own — session
  volume is what the Agents dashboard already charts, and the Models tab's
  Serving and GPU capacity views already are the model-side signals.
- `/agent-platform/usage`, the tab's former single-page form, redirects to
  `/agent-platform/dashboards` (via `app.routes.redirects`, so no dummy tab is
  needed to host it). Without it that path matched the section's own `/*` route
  but none of its tab routes, and drew the full tab row over an empty body.
  The query string is not carried over.
- muster's shared `SectionHeader` takes an optional `as` prop (default `p`,
  unchanged), so a screen that does have a heading tree can file each section
  under its own heading.
