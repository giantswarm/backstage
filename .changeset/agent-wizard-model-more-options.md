---
'@giantswarm/backstage-plugin-agent-platform': patch
---

New-agent wizard: the model moves behind "More options" next to the runtime,
technical name and egress, so step 1 shows only the name, what the agent is for
and its instructions. The installation's default model (`default-model-config`)
is preselected when there are several, else the only one or the first listed;
the picker says which was preselected and why, and a line under the fields
names it ("Runs on … · change under More options"). A missing model opens More
options on Continue. The review step is unchanged.
