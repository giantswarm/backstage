---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Capabilities tab's button names its outcome, and a disabled one is quiet. Once the
comparison has landed, **Enable** and **Apply changes** carry the files a commit would change
(_Apply changes · 2 files_), and the dialog's last step names the pull requests it opens
(_Open 1 pull request_), so the card and the dialog say the same thing. A button the manager
refuses, or that waits on a running action or comparison, is the secondary variant with its
reason as the accessible description: the primary fill is the one button that can be
pressed. A capability whose comparison did not run keeps the mark the Installations page
shows it under, its tooltip reading _not installed: Not installed, not compared: <the
manager's reason>_ instead of _unknown: Unknown_.
