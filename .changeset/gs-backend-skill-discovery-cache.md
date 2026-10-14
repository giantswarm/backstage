---
'@giantswarm/backstage-plugin-gs-backend': minor
---

`GET /agent-skills` answers from an in-memory cache per repository and ref instead of asking GitHub on every page view. The cache keeps a listing for 10 minutes. After that, a revalidation of an unchanged branch costs two GitHub requests instead of three plus one per skill. When GitHub refuses with a rate limit, or a host is down, the cache serves the last listing (up to a day old) with `stale: true` and waits for GitHub's reset time before asking again. Each skill now carries `contentReadable`. A `SKILL.md` that could not be read no longer drops its skill silently: the skill is listed as unreadable and its read is retried after 2 minutes. `GET /agent-skills/content` answers a `SKILL.md` the listing already read without another request.
