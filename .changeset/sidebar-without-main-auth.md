---
'app': patch
---

Keep the sidebar working on a portal without a main auth provider (`gs.authProvider` unset, for example the guest sign-in of a local start). The cluster access item and its connector need that provider and threw without it, taking the whole sidebar down; they are now left out in that case.
