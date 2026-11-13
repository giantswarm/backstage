---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

A session turn the model provider refused or could not answer now reads "Could not reach the model" with a plain sentence on what to check, and keeps kagent's error under a "Technical details" fold-out. The failure classifier reads the Go ADK's `llm error response (code …)` errors and Anthropic's `authentication_error` and `permission_error` as `model-unavailable`, and takes the HTTP status from an Anthropic or OpenAI SDK error rather than any three-digit number in its text. New `isCredentialsRefusedText` says whether such a failure is the provider refusing the agent's credentials.
