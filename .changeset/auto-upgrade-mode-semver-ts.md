---
'@giantswarm/backstage-plugin-gs': patch
---

A deployment's automatic upgrades ("None", "Patch", "Minor and patch", "Any") are read from its OCIRepository semver range the way Flux reads it, starting from the version Flux currently resolves the range to. Bounded ranges were misread: `>=1.2.3 <2.0.0` and `>=1.2.0, <1.3.0` showed "Any", `1.2.3 - 1.4.0` showed "None". The edit form's chart version is the current version, else the lowest version the range admits.
