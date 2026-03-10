# Grafana

Giant Swarm provides Grafana in every management cluster.

The base URL for Grafana follows the scheme `https://grafana.<mc-base-domain>`. Example: `https://grafana.gazelle.awsprod.gigantic.io/`. In the Giant Swarm devportal, the link can also be found via the catalog, in Resource entities of type "installation". Example snippet:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: gazelle
  links:
    - url: https://grafana.gazelle.awsprod.gigantic.io/
      title: Grafana (customer URL)
      icon: grafana
...
```

Grafana provides access to Mimir metrics, Loki logs, and in some cases to tracing data. It also manages alerts.

The developer portal provides links to relevant Grafana entry points in several places:

- **On the installation (resource) entity page**, there are two links to Grafana. The teleport one is only accessible to Giant Swarm members and the preferred method for them. The other link is accessible to customers and Giant Swarm members alike.
- **On the cluster detail page**, there are links to a cluster overview dashboard (for that cluster) and to the Alerts section for that cluster in Grafana.

You can provide links to specific metrics using the Explore function in Grafana. For example, this link points to the Explore page for the query `up{cluster_id="operations",namespace="giantswarm"}` for the main Mimir datasource, showing a time series representing the last hour.

    https://grafana.gazelle.awsprod.gigantic.io/explore?schemaVersion=1&panes=%7B%22row%22:%7B%22datasource%22:%22gs-mimir%22,%22queries%22:%5B%7B%22refId%22:%22A%22,%22expr%22:%22up%7Bcluster_id%3D%5C%22operations%5C%22,namespace%3D%5C%22giantswarm%5C%22%7D%22,%22range%22:true,%22datasource%22:%7B%22type%22:%22prometheus%22,%22uid%22:%22gs-mimir%22%7D,%22editorMode%22:%22code%22,%22legendFormat%22:%22__auto%22%7D%5D,%22range%22:%7B%22from%22:%22now-1h%22,%22to%22:%22now%22%7D,%22compact%22:false%7D%7D&orgId=1

The query string of above URL in decoded format:

schemaVersion=1&panes={"row":{"datasource":"gs-mimir","queries":[{"refId":"A","expr":"up{cluster_id=\"operations\",namespace=\"giantswarm\"}","range":true,"datasource":{"type":"prometheus","uid":"gs-mimir"},"editorMode":"code","legendFormat":"__auto"}],"range":{"from":"now-1h","to":"now"},"compact":false}}&orgId=1

orgId=1 is important to enable the Grafana organization that both customers and Giant Swarm staff have access to.
