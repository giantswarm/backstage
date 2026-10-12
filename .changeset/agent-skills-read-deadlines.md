---
'@giantswarm/backstage-plugin-gs-backend': patch
---

The agent-skills routes recover from a stalled upstream and edit a skill again after its first pull request:

- Every upstream skill read has a deadline: 60 seconds for a clone and 30 seconds for a GitHub read. A read past it is aborted and answers 504, which is never remembered as a miss. `GET /agent-skills` serves its last listing instead when it has one.
- The read limit's own "too many reads" 503 is no longer cached as an upstream outage.
- An empty `ref` now reads the default branch, as an absent one does. It no longer gives listed skills an empty `ref`.
- `/agent-skills/content` and `/agent-skills/content/file` accept every skill directory that discovery lists, including ones with spaces or non-ASCII letters. Updates accept them too. A new skill's directory is still a lowercase slug.
- Concurrent reads of one generic-git commit share one clone, whichever files they ask for.
- A skill pull request whose branch already exists answers 409 only when a pull request is open from that branch, and links it. A leftover branch is left alone, and the edit goes to a new branch suffixed with the short head commit. When writing the file or opening the pull request fails, the branch the request created is deleted again.
