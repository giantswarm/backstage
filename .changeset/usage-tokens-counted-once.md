---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Usage pages count cached input tokens once. Since agentgateway v1.5.0 the gateway's `input` count already holds the cache reads and writes, so token totals, $/1M rates and the cache read share were up to 2x off. They now agree with the session estimate, and the tokens per day chart stacks fresh input, cache reads, cache writes and output. Totals from a gateway older than v1.5.0 are read as before.
