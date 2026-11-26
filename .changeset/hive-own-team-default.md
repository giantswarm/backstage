---
'@giantswarm/backstage-plugin-plans': minor
---

Hive's team selector starts on the reader's own team from the catalog (`team-shield` → Team Shield) instead of Bumblebee, which stays the default for people in none of Hive's teams. Only a team picked in the header is remembered, under a new key: the old one held Bumblebee for every reader, so earlier picks start over once. A link's `?team=` scopes the page it opens without becoming the reader's pick.
