# User facing feature flags

- `ai-chat-verbose-debugging`: Enables verbose output for the AI Chat plugin, showing reasoning output and tool usage details.

- `experimental-data-fetching`: Enables an alternative strategy for fetching resources in the Clusters and Deployments lists. By default, we query lists of resources and optimize for few queries with large result sets. When active, the strategy is changed to use more queries with smaller result sets.
