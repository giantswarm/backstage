---
'app': patch
---

Stop reporting "Untracked page view" warnings to Sentry for paths that do not match any registered app route. Bot/scanner probes against the public URLs (e.g. `/wp-login.php`) land on the "Not Found" page and previously created noise issues in Sentry. Untracked page views on real app routes are still reported.
