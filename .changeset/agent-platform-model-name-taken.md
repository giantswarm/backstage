---
'@giantswarm/backstage-plugin-agent-platform': patch
---

An organization's Add model no longer changes a model of the same name that another person made in the meantime: the write is refused. New model, Add model and the credential form now say that a model with this name exists and to choose another name, instead of agent-manager's raw `already_exists` answer.
