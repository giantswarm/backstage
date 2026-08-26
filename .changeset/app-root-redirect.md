---
'app': minor
---

Add the optional `app.rootRedirect` key. When set, `/` redirects to that in-app path (for example `/agent-platform`) instead of rendering the home page; unset keeps the home page, and so does a value that does not start with `/` or that is `/` itself. It lets a single-product deployment land on that product's page without a code change. The home page extension (`page:home`) must stay enabled, since it owns the `/` route.
