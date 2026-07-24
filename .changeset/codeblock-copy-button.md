---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Add a reusable `CodeBlock` component (`ui-react`) that renders a code block with
a copy-to-clipboard button, and migrate the `gs` plugin's code blocks to it.

The copy button is now correctly aligned to the top-right of its code field
(removing the previous negative-margin workaround), uses a neutral bui
`ButtonIcon` (`tertiary` variant) instead of the oversized primary-colored
`CopyTextButton`, and shows a text-sized icon with a "Copy"/"Copied" tooltip and
check-icon feedback. This fixes the displaced copy button in the "Kubernetes API
access" and "SSH access" cluster detail boxes.
