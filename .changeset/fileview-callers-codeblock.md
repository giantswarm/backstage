---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Import `FileView` from `ui-react`. The new-agent wizard's helm command and a
failed toolchain build's log are no longer shown as files: they render in
`CodeBlock`, without a file header. The log sits under a "Log of the failed
job" heading, scrolls inside the block instead of stretching the page, and
opens at its end, where the error is.
