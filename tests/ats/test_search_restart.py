"""The search index outlives a backend restart on the postgresql engine.

The functional scenario starts from ATS's install with the chart's defaults
(sqlite), installs the CloudNativePG operator and upgrades the release to the
postgresql engine as ci/ci-values-case1.yaml sets it, with one catalog entity
mounted as a file location. Once search finds the entity, the backend restarts
and the first search on the new pod must find it again. The catalog collator
runs 90 s after its first start and then every 30 min; the scheduler keeps that
next run in the database across the restart, so the restarted backend answers
from the index the first one wrote, never from one of its own.
"""

import json
import logging
import os
import secrets
import socket
import subprocess
import tempfile
import time
from contextlib import contextmanager
from typing import Iterator

import pytest
import requests

logger = logging.getLogger(__name__)

CNPG_MANIFEST = "https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v1.30.1/cnpg-1.30.1.yaml"
ENTITY_NAME = "ats-search-restart"
SELECTOR = "app=backstage,component=backstage"

RELEASE = os.environ.get("ATS_RELEASE_NAME", "backstage")
NAMESPACE = os.environ.get("ATS_RELEASE_NAMESPACE", "default")
CHART = os.environ.get("ATS_CHART_PATH", "")


def run(*args: str, timeout: int = 900) -> str:
    logger.info("running: %s", " ".join(args))
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise AssertionError(f"{' '.join(args)} failed:\n{result.stdout}\n{result.stderr}")
    return result.stdout


def kubectl(*args: str, timeout: int = 900) -> str:
    return run("kubectl", "--namespace", NAMESPACE, *args, timeout=timeout)


def install_cnpg_operator() -> None:
    run("kubectl", "apply", "--server-side", "--force-conflicts", "-f", CNPG_MANIFEST)
    run(
        "kubectl", "--namespace", "cnpg-system", "rollout", "status",
        "deployment/cnpg-controller-manager", "--timeout=5m",
    )


def upgrade_to_postgresql(token: str) -> None:
    entity = {
        "apiVersion": "backstage.io/v1alpha1",
        "kind": "Component",
        "metadata": {"name": ENTITY_NAME},
        "spec": {"type": "service", "lifecycle": "experimental", "owner": "ats"},
    }
    kubectl(
        "create", "configmap", "ats-catalog",
        f"--from-literal=entities.yaml={json.dumps(entity)}",
    )
    values = {
        # The engine as ci/ci-values-case1.yaml sets it, sized for kind.
        "database": {
            "engine": "postgresql",
            "postgresql": {"clusterNameSuffix": "cnpg", "instances": 1, "storageSize": "1Gi"},
        },
        "backstage": {
            "appConfig": {
                "backend": {
                    "auth": {
                        "externalAccess": [
                            {"type": "static", "options": {"token": token, "subject": "ats"}}
                        ]
                    }
                },
                "catalog": {
                    "locations": [{"type": "file", "target": "/ats-catalog/entities.yaml"}]
                },
                "search": {
                    "collators": {
                        "catalog": {
                            "schedule": {
                                "initialDelay": {"seconds": 90},
                                "frequency": {"minutes": 30},
                                "timeout": {"minutes": 5},
                            }
                        }
                    }
                },
            },
            "extraVolumes": [{"name": "ats-catalog", "configMap": {"name": "ats-catalog"}}],
            "extraVolumeMounts": [{"name": "ats-catalog", "mountPath": "/ats-catalog"}],
        },
    }
    with tempfile.NamedTemporaryFile("w", suffix=".yaml") as f:
        json.dump(values, f)
        f.flush()
        run(
            "helm", "upgrade", RELEASE, CHART, "--namespace", NAMESPACE,
            "--reuse-values", "--values", f.name, "--wait", "--timeout", "9m",
            timeout=600,
        )


def ready_pod() -> str:
    pods = json.loads(kubectl("get", "pods", "--selector", SELECTOR, "--output", "json"))
    for pod in pods["items"]:
        if pod["metadata"].get("deletionTimestamp"):
            continue
        conditions = pod.get("status", {}).get("conditions", [])
        if any(c["type"] == "Ready" and c["status"] == "True" for c in conditions):
            return pod["metadata"]["name"]
    raise AssertionError("no ready backstage pod")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextmanager
def port_forward(pod: str) -> Iterator[str]:
    port = free_port()
    proc = subprocess.Popen(
        ["kubectl", "--namespace", NAMESPACE, "port-forward", f"pod/{pod}", f"{port}:7007"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        url = f"http://127.0.0.1:{port}"
        for _ in range(30):
            try:
                requests.get(f"{url}/.backstage/health/v1/readiness", timeout=2)
                break
            except requests.ConnectionError:
                time.sleep(1)
        yield url
    finally:
        proc.terminate()
        proc.wait(timeout=10)


def search(url: str, token: str) -> requests.Response:
    return requests.get(
        f"{url}/api/search/query",
        params={"term": ENTITY_NAME, "types[]": "software-catalog"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )


def titles(response: requests.Response) -> list[str]:
    return [r["document"]["title"] for r in response.json()["results"]]


@pytest.mark.functional
def test_search_index_survives_a_backend_restart() -> None:
    token = secrets.token_hex(24)
    install_cnpg_operator()
    upgrade_to_postgresql(token)

    first = ready_pod()
    with port_forward(first) as url:
        deadline = time.monotonic() + 600
        while True:
            response = search(url, token)
            if response.status_code == 200 and ENTITY_NAME in titles(response):
                break
            assert time.monotonic() < deadline, f"never indexed: {response.status_code} {response.text}"
            time.sleep(10)
    logger.info("pod %s indexed %s", first, ENTITY_NAME)

    kubectl("rollout", "restart", "deployment/backstage")
    kubectl("rollout", "status", "deployment/backstage", "--timeout=10m", timeout=700)
    second = ready_pod()
    assert second != first

    with port_forward(second) as url:
        response = search(url, token)
    logger.info("first search on restarted pod %s: %s %s", second, response.status_code, response.text)
    assert response.status_code == 200, response.text
    assert ENTITY_NAME in titles(response)
