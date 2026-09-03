---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The GPU capacity view lists only accelerator nodes, and says which of them the
serving layer will actually place a model on.

- **CPU-only nodes are gone.** A kserve model-manager (before 0.11) reports
  every cluster node it budgets, CPU boxes included; they rendered as
  "62.4 GiB free" rows with GPUs "—". The merge now keeps a node only with
  accelerator evidence — a device plugin advertising one, a discovery label, or
  the serving layer's own verdict — or when it is a backend host (the Ollama
  row, `budgetSource: host-meminfo`), and drops the rest.
- **Not NVIDIA-only.** The cluster read recognises a node by the resource the
  installation's discovery ConfigMap names (`gpuResourceName`, read by the
  KServe source now) or any known accelerator resource (`nvidia.com/gpu`,
  `amd.com/gpu`, `intel.com/gpu`, `google.com/tpu`, `habana.ai/gaudi`,
  `<vendor>/npu`), besides the gpu-feature-discovery labels — and counts
  capacity, allocatable and requests in that resource. Without a product label
  the GPU column names the resource.
- **Serving targets.** model-manager 0.11 reports `eligible` /
  `eligibilityReason` per node. A node it will not place a model on — outside
  the serving node selector, or unable to mount the model cache — is dimmed
  with "Not a serving target" under its name and the reason on hover (in the
  budget tooltip too), and the Serve dialog lists it disabled with the reason
  instead of offering it as a target, so a pin there no longer yields a
  predictor stuck Pending on a volume node-affinity conflict. Where the serving
  layer gives no verdict, a GPU node without a cache next to a node of the
  same installation that holds a node-local one gets the softer hint "no model
  cache on this node".
