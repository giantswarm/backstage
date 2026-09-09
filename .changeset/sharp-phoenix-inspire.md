---
'@giantswarm/backstage-plugin-muster': patch
---

Show a gate instead of an empty section when the installation's inventory probe
was refused.

When the API server of the home (or pinned) installation rejected the portal's
token, `MusterInstanceProvider` dropped the installation and the section
rendered nothing that explained why: the dashboard sat on its progress bar, the
other views claimed no installation runs muster. The provider now exposes the
failure (`inventoryFailure`, from gs `selectInventoryFailure`) and a
`refreshInventory`, and `MusterSection` renders the gs `InventoryFailureGate` in
place of the views: it names the installation, quotes the 401/403/error and
offers the remedy -- for a 401, signing out of the portal and in again.

`Gate` moved to `ui-react`; muster re-exports it, so its call sites are
unchanged.
