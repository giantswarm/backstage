# @giantswarm/backstage-plugin-review-queue

Frontend plugin (`pluginId: review-queue`) that adds a **Reviews** tab to Hive
(`/hive/reviews`): the pull requests waiting on the signed-in person, on their
teams and on the team Hive is scoped to, and their own PRs waiting for review,
each with its CI, review and merge state. There is no backend: every read is a
tool of muster's `github` server (GitHub's hosted MCP server), and Post to
Slack is a tool of its `slack` server, each called through the installation's
muster as the person with their own grants.

## Sections

| Section                    | Search                                                | PR state         |
| -------------------------- | ----------------------------------------------------- | ---------------- |
| Waiting on me              | `review-requested:@me` (you, or a team you are in)    | read at once     |
| My PRs awaiting review     | `author:@me -review:approved`                         | read at once     |
| Reviewed by me, still open | `reviewed-by:@me -author:@me`                         | on "Show status" |
| Waiting on _team_          | `team-review-requested:giantswarm/team-<x>`, per team | on "Show status" |

- The team section follows Hive's header (`?team=`): it shows when the team
  is not one of yours (yours are in "Waiting on me" already), and one section
  per team, yours left out, under "All teams".
- "Waiting on me" tags each row `you` or with your team the request names: one
  more search for requests to you and one per team of yours, since GitHub's
  short form of a PR does not carry its requested reviewers.
- A section shows one search page, 100 PRs, oldest first; past that its count
  reads "100 of 143" and a link opens the same search on github.com.

## Rows

CI (check runs and CircleCI's commit statuses, the latest run of each check),
Review (each reviewer's latest decision) and Merge (`mergeable_state`, read
once more when GitHub is still computing it), each with a tooltip saying why.
That is four reads per PR on GitHub's general budget, two at a time, shared
by the sections and kept as long as the searches (about two minutes).
Collapsed sections read nothing. A row opens the PR on GitHub in a new tab.

## Post to Slack

"My PRs awaiting review" carries a tick per row and **Post to Slack**: one
message about the ticked PRs, each with its link, repository and state,
posted to a channel as the person through muster's `slack` server
(`x_slack_send_message`, with their own Slack grant). The dialog opens with
the channel named after the team in view (Hive's `Shield 🛡️` →
`#team-shield`; under "All teams", the person's own first team), and both the
channel and the message can be changed before Send. A channel name is looked
up with `x_slack_search_channels`; an ID is used as it is. The calls declare
URL elicitation, so a person without a Slack grant is asked to connect Slack
and the message is sent once they have. Nobody is mentioned unless the person
adds a mention.

## Filters and URL

Hide bot PRs (`renovate[bot]`, `dependabot[bot]`, `taylorbot` and
`architectbot` in the search, any other `[bot]` on the page), hide drafts,
giantswarm only, hide archived repos: all on by default, each a URL parameter
when off. A section's sort (`?sort.<section>=<column>:<direction>`) and the
sections whose status was asked for (`?status=`) are in the URL too, and
Hive's header search (`?q=`) narrows every list.

## Gating

The tab is a `SubPageBlueprint` attached to Hive (`page:plans`), as the
roadmap plugin's Roadmap tab is. It follows Hive: Hive is off by default and
a deployment turns it on with `page:plans` and `api:plans` in
`app.extensions`, so the tab shows wherever Hive is on and nowhere else.

## Fixture mode

`muster.fixtures` serves the `github` server's tools from
`src/apis/fixtures/`: `docs/fixtures.md`, "Reviews".

```bash
yarn fixtures start --enable page:plans --enable api:plans
```
