---
'app': patch
'backend': patch
---

Force fixed versions of vulnerable transitive npm dependencies via yarn `resolutions` to remediate the Critical/High CVEs that dominate the published `giantswarm/backstage` image scan. The OS base (`node:24-trixie-slim`) was already clean; every finding was in the bundled Node.js dependency layer. Pinned: `vm2` 3.11.5, `sha.js` 2.4.12, `protobufjs` 7.5.5, `basic-ftp` 5.2.0, `jsonpath-plus` 10.3.0; `fast-xml-parser` v4 line to 4.5.4 (v5 consumers untouched), `form-data` v2 line to 2.5.4 (v4 already fixed), `path-to-regexp` `~0.1.12` to 0.1.13, `axios` v1 line to 1.8.2, `tar` v6 line to 7.5.3, `undici` v5 line to 6.21.2, and `minimatch` `^10.0.0` to 10.0.3.
