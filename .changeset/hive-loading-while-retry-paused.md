---
'@giantswarm/backstage-plugin-plans': patch
---

The Hive tabs (Now, History, Knowledge) and the Plans page show their
progress bar while a failed read's retry waits for the tab to come back,
instead of a blank view; then the data, or the error with "Try again".
