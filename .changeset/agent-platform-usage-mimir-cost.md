---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-backend': minor
---

Make Mimir the source of the Agent Platform's usage figures, add estimated
cost, and split the Usage tab into sub-tabs.

The Usage tab previously showed only numbers derived from kagent's REST API.
That could never cover anyone but the signed-in user — kagent's session list is
`WHERE user_id = <caller>` with no cross-user endpoint — and knew nothing about
cost, because kagent records none. agentgateway's LLM metrics are gateway-side,
so they cover every user by construction and carry priced spend.

The tab now has four views:

- **Overview** — cost, tokens, model calls, agents and models active, blended
  $/1M tokens and the cache-read share; cost per day stacked by model, tokens
  per day stacked by token type, and the gateway's request duration, error rate
  and 429 count. Every user's traffic.
- **Cost** — the same metrics broken down by agent and by model, with share of
  spend, $/1M and average tokens per call, plus a table of models the gateway
  cannot price.
- **Your sessions** — the previous kagent-derived section, now with an
  estimated cost. Only ever the caller's own, which the tab makes structural.
- **MCP tools** — the section the muster plugin contributes, unchanged. Hidden
  when muster is not registered.

Two kinds of cost figure, named apart. Per agent and per model it is
**"Cost"** — measured, priced per call by the gateway from its model catalogue
as the call happens. Per session it is **"Est. cost"** — the metrics carry no
session label, so it cannot be read at all: it is kagent's token counts priced
at an observed $/token over the last 7 days.

That rate resolves in tiers, and the session detail stat carries a tooltip
naming which one it used: the **session's own model** where the gateway has
priced it, then nothing at all when the model is known but unpriced, and only
when no model is resolvable does it fall back to the agent's or the
installation's blend. A known model never borrows another model's price — a
real `claude-opus-5` session read $0.194 against a catalogue price of $0.40
because it was charged the installation's Sonnet-derived blend, so that case
now shows `—` with the reason instead of a number that is half right. A model missing from `llmRouting.modelCatalog` contributes no
cost rather than an error, so anywhere no rate can be derived reads `—` rather
than `$0.00`, and the "models with no usable price" table says how much is
uncounted.

Per-_user_ breakdowns remain impossible: the gateway metrics carry no user
label.

Also in this change:

- `MimirService` gains `queryRange`, exposed as `GET /mimir/query_range` and
  `useMimirRangeQuery` — the Mimir path was instant-query only, so no
  time-series chart could be built on it.
- The daily charts render one bar per day of the window, zeros included, so a
  young metric cannot draw a single bar across the whole chart; today's bar
  comes from its own instant query over elapsed-time-since-midnight, which is
  real spend so far rather than a part-day extrapolated to a whole one.
- The five agentgateway metrics are registered in the central metrics registry,
  and `useMimirQuery`/`useMimirRangeQuery`/`useMimirAvailable` are exported from
  the gs plugin so other plugins can query Mimir.
- `ui-react` gains a validated categorical chart palette (`assignSeriesColors`),
  a `DataBar` component (a number with a proportional bar beneath it, for a
  table column whose rows are worth comparing), and `StackedBarChart` gains
  `showLegend`, `allowDecimalTicks` and `maxBarWidth`.
- Every numeric column on all four Usage tables carries a data bar, scaled to
  that column's own maximum and coloured per **measure** — so money is the same
  hue everywhere, and the separate hues signal that bars compare rows down a
  column rather than across columns. Error counts take the reserved status red
  rather than a categorical slot.
- The MCP tools tab's two tables now stack instead of sharing a row: at half
  width the tool-name column wrapped to three lines and the numeric columns
  were too narrow for a bar to be worth reading. Their numeric columns are also
  left-aligned now, matching every other Usage table — bars grow from the
  left.
