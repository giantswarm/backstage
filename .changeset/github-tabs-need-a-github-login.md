---
'app': patch
---

The GitHub Actions and Pull Requests tabs of a Component, and the GitHub
Actions recent-runs card, are offered only on a portal with a GitHub login:
`gs.github` (the person's GitHub grant in muster) or `auth.providers.github`.
A portal with neither showed both tabs, and opening one led to a "Login
Required: GitHub" dialog whose popup failed with `No auth provider registered
for 'github'`, over and over. Such a portal now shows neither tab, without
any `app.extensions` entry. Documented in `docs/configuration.md`.
