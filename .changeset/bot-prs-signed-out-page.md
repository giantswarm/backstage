---
'@giantswarm/backstage-plugin-bot-prs': patch
---

Bot PRs without a marge grant is the sign-in alone: the toolbar, the tiles, the
filters and the table no longer render behind it, and the missing grant is one
warning instead of one per team in scope. A team the catalogue names and
giantswarm/github has no team file for is a single warning that lists those
teams; any other refusal is one alert that names the teams and the messages.
