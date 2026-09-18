---
'@giantswarm/backstage-plugin-bot-prs': patch
---

Bot PRs without a marge grant is the sign-in alone: the toolbar, the tiles, the
filters and the table no longer render behind it, and the missing grant is one
warning instead of one per team in scope. A team the catalogue names and
giantswarm/github has no team file for is a single warning that lists those
teams; any other refusal is one alert that names the teams and the messages.

A server list muster could not answer is no longer read as "this portal has no
marge": the page calls marge on the pinned or home installation and reports
what marge or muster says, and the admin-facing empty state is kept for the
one case that earns it, a muster that answered without marge. An expired
portal session is named as such instead of shown as a refusal.
