---
'@giantswarm/backstage-plugin-agent-platform': minor
---

An organization's admin sets a model's token limit and prompt caching (on or off, and the cache time: 5 minutes or 1 hour) on Connect a model, Add model and Edit model, for the providers that have each setting. A new Anthropic model has prompt caching on for 5 minutes. An edit sends only the settings and the display name that the person changed; clearing the token limit or the display name removes it. The organization's Models tab shows each model's display name and settings. A setting that agent-manager refuses shows as a message that names the setting. Installations whose agent-manager does not take the settings show none of this and get no new arguments.
