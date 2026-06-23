---
'app': patch
'backend': patch
---

Raise the transitive-dependency CVE `resolutions` to the currently-fixed versions so the High count in the published image is cut substantially (the previous pass cleared all fixable Critical findings but pinned to point-in-time versions that newer CVEs have since flagged). Updated/added pins: `tar` 7.5.11, `undici` v5 line to 6.27.0 and v7 lines to 7.28.0, `axios` v1 line to 1.16.0 and v0 line to 0.32.0, `protobufjs` 7.6.1, `basic-ftp` 5.3.1, `form-data` v2 to 2.5.6 and v4 to 4.0.6, `multer` 2.2.0, `node-forge` 1.4.0, `ws` 8.21.0, `fast-xml-builder` 1.1.7, and `minimatch` (3.x→3.1.4, 5.x→5.1.8, 7.4.x→7.4.8, 9.x→9.0.7, 10.x→10.2.3).
