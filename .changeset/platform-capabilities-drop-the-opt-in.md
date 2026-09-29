---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Capabilities tab no longer knows an installation opt-in. giantswarm-platform-manager
stops reading `management-clusters/<name>/platform-manager.yaml`: a capability's fileset on
record reads _enabled_ whoever put it there, and the manager's word for a refused commit is
the one line under the button. Gone from the card: the owners' line that named the file and
disabled **Enable** and **Apply changes** until an installation's owners had landed it, and
the states `not opted in` and `enabled, not opted in`. **Enable** works where nothing is on
record and **Apply changes** where the capability was installed by hand, the person's pull
requests being the review.
