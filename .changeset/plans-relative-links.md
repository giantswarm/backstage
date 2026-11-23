---
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Links in plan documents work as on GitHub, in a pull request's review and in Merged plans. A relative link to another document opens it in the portal (`?doc=`), scrolled to its `#section` if the link names one. A `#heading` link jumps within the document, matched the way GitHub matches headings. A folder, or a file the portal doesn't show, opens on GitHub in a new tab: at the pull request's head branch in review, at the default branch for merged plans. ui-react exports `InPageAnchors`, so a renderer with its own components can make `#heading` links jump.
