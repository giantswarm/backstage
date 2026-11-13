---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

A session turn the model could not answer now shows a plain explanation, with the raw error folded under "Technical details". Refused access asks the platform team to check the model's credentials and permissions; other model failures suggest trying again or asking for help. This includes rate limits, missing models and provider outages.

The failure classifier recognises Go ADK model errors and provider authentication and permission errors. An Anthropic or OpenAI SDK error's HTTP status takes precedence over numbers and error names inside its message. `isCredentialsRefusedText` distinguishes refused model access from other model failures.
