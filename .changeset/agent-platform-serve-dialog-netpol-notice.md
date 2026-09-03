---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Serve dialog's network notice follows the installation: when the chart's
discovery document says it renders the serving namespace's network policies
(`networkPolicy.enabled`, chart ≥ 0.13.0 with `global.networkPolicy`), the
dialog says so and names the flavor instead of sending operators to write
policies by hand that already exist; without the field, or with it disabled,
it keeps the hand-written-policy guidance, no longer claiming the platform
cannot ship them.
