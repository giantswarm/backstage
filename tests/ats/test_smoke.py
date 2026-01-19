import logging

import pykube
import pytest

from pytest_helm_charts.clusters import Cluster
from pytest_helm_charts.k8s.deployment import wait_for_deployments_to_run

logger = logging.getLogger(__name__)


@pytest.mark.smoke
def test_api_working(kube_cluster: Cluster) -> None:
    """Test that the Kubernetes API is working and accessible."""
    assert kube_cluster.kube_client is not None
    assert len(pykube.Node.objects(kube_cluster.kube_client)) >= 1


@pytest.mark.smoke
def test_backstage_deployment_ready(kube_cluster: Cluster) -> None:
    """Test that the backstage deployment is running and pods are ready."""
    deployments = wait_for_deployments_to_run(
        kube_cluster.kube_client,
        ["backstage"],
        "default",
        600,
    )
    for d in deployments:
        assert int(d.obj["status"]["readyReplicas"]) > 0
        logger.info(f"Deployment '{d.name}' is ready with {d.obj['status']['readyReplicas']} replicas")
