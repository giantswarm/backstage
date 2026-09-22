---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The **Enable** button on an installation's Capabilities tab works where nothing
of the capability is on record, whether or not the installation's owners have
landed the opt-in file. The card disabled it for every installation without
`management-clusters/<name>/platform-manager.yaml` with `optIn: true`, naming
the file the owners add first, so no capability could be enabled anywhere the
declaration was not on record yet. The opt-in protects what is on record: the
owners' line and the disabled button now belong to a capability the owners
installed themselves without the opt-in (*Installed*, **Apply changes**
disabled), and a fresh enable is the person's to review as pull requests.
The manager's own reason for a refusal shows as before; a manager that still
answers the state `not opted in` for nothing on record is read as not installed.
