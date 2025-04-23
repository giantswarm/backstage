# User facing feature flags

- `experimental-data-fetching`: Enables an alternative strategy for fetching resources in the Clusters and Deployments lists. By default, we query lists of resources and optimize for few queries with large result sets. When active, the strategy is changed to use more queries with smaller result sets.
