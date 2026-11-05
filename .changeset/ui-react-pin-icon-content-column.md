---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add `PinIcon`, a push-pin glyph (outline, or solid with `filled`), and
`ContentColumn`, a centred content column at the shell's content width, with
that width as `SHELL_CONTENT_MAX_WIDTH`. `ShellPage` now takes its maximum
width from the same constant (unchanged at 1080px). Both components come from
`agent-platform`, where `ContentColumn` was called `UsageColumn`.
