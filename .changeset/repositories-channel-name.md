---
'@giantswarm/backstage-plugin-repositories': patch
---

A write's plan and its outcome name the ask's and notice's Slack channel as
the team's channel file does -- "Approval asked to #team-bumblebee
(team-bumblebee)", "The ask posted to #team-bumblebee (team-bumblebee)" --
from the manager's `channelName`, instead of the channel ID the manager
delivers to. Without a name the ID shows, as before. Needs
giantswarm-repo-manager 0.32.0 or later for the name.
