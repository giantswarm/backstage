---
'@giantswarm/backstage-plugin-gs': patch
---

A deployment's automatic upgrades ("None", "Patch", "Minor and patch", "Any") are read from its OCIRepository reference the way Flux reads it: a digest pins the version, a semver range takes precedence over a tag, and the range is evaluated from the version Flux currently resolves it to. Bounded ranges were misread: `>=1.2.3 <2.0.0` and `>=1.2.0, <1.3.0` showed "Any", `1.2.3 - 1.4.0` showed "None". Ranges with gaps (`>=1.2.3, !=2.0.0`, `~1.2.3 || ~1.4.0`) are read by whether any higher version is admitted. The edit form's chart version follows the same precedence: the current version, else the lowest version the range admits.
