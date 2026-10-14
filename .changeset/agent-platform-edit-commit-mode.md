---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Edit agent: an agent applied from git is edited through a pull request where agent-manager reports the `commit` capability. The page dry-runs the change with `validate_agent` in mode `commit`, shows the composed values and every violation as for a live edit, and offers **Commit** (`update_agent` in mode `commit`, a pull request as the signed-in person) in place of Save; once the pull request is open, Commit is locked for that change, so a second click opens none. An agent written live keeps only Save. Every agent write in mode `commit` (create, edit, delete, add model backend) now reads the pull request from agent-manager's `commit` answer and shows it with its repository and number; a commit refused with `auth_required` is shown as the write's refusal.
