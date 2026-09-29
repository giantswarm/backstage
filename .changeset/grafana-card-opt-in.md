---
'app': minor
---

The Grafana dashboards card on entities carrying `grafana/dashboard-selector`
is disabled by default and enabled per portal through `app.extensions`
(`entity-card:catalog/grafana-dashboards: true`). The card works only where the
plugin is wired, a `proxy.endpoints` entry at `/grafana/api` with a
service-account token for the `grafana` host; the section itself is required
by the plugin's schema on every portal and the annotated team Groups reach every
portal through the shared catalog, so until now every portal without the proxy
entry showed `Request failed with 404 Not Found` on every team page. Portals
that wire the plugin add the switch; everywhere else the team pages show
neither the card nor the error. Documented in `docs/configuration.md`.
