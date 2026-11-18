---
'@giantswarm/backstage-plugin-agent-platform': patch
---

New model and Edit model save an organization's model through agent-manager and write no Secret from the portal, so organization admins can add and change their models again. The key is entered on the credential form: a new model, a replaced key or a new provider continue there. A model agent-manager wrote in an organization is editable, and a person who may not change the organization's models sees "Not permitted" with who can.
