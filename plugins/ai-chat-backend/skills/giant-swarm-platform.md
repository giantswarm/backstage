# The Giant Swarm platform

## Organization

- An Organization is a concept to separate tenants in a management cluster.
- Organizations are defined by the cluster-scoped Organization CR (organizations.security.giantswarm.io).
- Each organization has a dedicated namespace in the management cluster, named after the organization, with the prefix 'org-'.

## Installation

- An installation is the combination of a management cluster and all workload clusters managed by that management cluster.
- Each installation has a unique name, which is identical with its management cluster name.
- To get details about an installation, fetch the entitity with kind "resource" and type "installation" from the catalog, named like the installation.

## Clusters

- Clusters are managed via Kubernetes Cluster API (CAPI).
  - The main resource defining a cluster is the Cluster CR (clusters.cluster.x-k8s.io). In the Giant Swarm platform, this resource is found in the namespace of the organization owning the cluster.
  - The Cluster CR has a reference to the InfrastructureRef, which is a reference to the infrastructure provider.
  - The Cluster CR has a reference to the ControlPlaneRef, which is a reference to the control plane.

## Applications and workloads

- Applications are deployed in several ways:
  - To the management cluster:
    - Via App CRs or HelmRelease CRs in the management cluster. These CRs can reside in various namespaces.
  - To workload clusters:
    - Via App CRs or HelmRelease CRs in the management cluster. These resources usually reside in the namespace of the organization that owns the workload cluster.
    - Via Helm directly on the workload clusters.
    - Via directly applying manifests for Deployments, StatefulSets, Deamonsets, etc.

## Networking

- The CNI used is Cilium
- Hubble UI is available in clusters for observing network traffic in real time. There is no ingress or gatway for this.
- Some clusters still support Ingress, but the migration towards Gateway API is ongoing.

## Observability

- The platform comes with an observability stack based on Mimir, Grafana, and Loki, for metrics, logs, alerts, and dashboards.
- Grafana is deployed to every management cluster.
