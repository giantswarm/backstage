---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

More Agent Platform forms check a field when you leave it and keep their
buttons pressable: a tool's or workflow's run form, Edit as JSON, Create
cluster, Delete cluster, Rename session, the agent wizard's Tools step and
"Update the agents using …". Pressed with a problem, the button now says what
is wrong on the field and moves the focus there instead of staying disabled
or showing a banner, and an error clears as soon as it is fixed. Error
messages for empty fields now say what to enter, for example "Enter a name
for the agent." or "Enter a value for message.".

`ui-react` exports `useGroupFieldError`, for a group of controls validated
as one field.
