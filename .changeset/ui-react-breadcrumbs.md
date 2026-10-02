---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add `Breadcrumbs`, a bui-based trail of links to a page's ancestors with the current page last. `useDetailsPane().getRoute` takes `{ keepSearch: true }` to keep the current query string (minus any earlier pane's parameters), for a link that opens the pane over the page it is on.
