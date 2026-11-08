---
'@giantswarm/backstage-plugin-plans-backend': minor
---

File reads (`/content`) are shared by every backend instance: each person's
reads are kept in the plugin's database (`plans_content_reads`) behind each
instance's own copy, so a person's second read of a plan or magazine file is
warm on whichever replica serves it. Every instance's copy expires with the
stored read it came from, so a changed file read anew on one replica replaces
the copy on every replica at once. A read made with one person's GitHub grant
is never served to another; when the database fails, reads come from GitHub
as on a cold start. Reads older than an hour are pruned hourly.
