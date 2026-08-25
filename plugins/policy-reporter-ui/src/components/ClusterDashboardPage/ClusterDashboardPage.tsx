import { Progress, Content } from '@backstage/core-components';
import { NamespaceTable, NamespaceRow } from '../NamespaceTable';
import { appendQueryParams } from '../../helper/query';
import { Container, Card, Text, CardBody, CardHeader } from '@backstage/ui';
import { useParams, useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core';
import { useDashboard } from '../../hooks/useDashboard';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { ClusterResourcesTable } from '../ClusterResourcesTable';
import { StatGrid } from '../Shared';

const useStyles = makeStyles(theme => ({
    section: {
        marginTop: theme.spacing(3),
        marginBottom: theme.spacing(2),
    },
}));

const resourceLink = (cluster: string, namespace: string, source?: string, category?: string) => {
    return appendQueryParams(`/policy-reporter-ui/clusters/${cluster}/namespaces/${namespace}`, source, category);
};

export const ClusterDashboardPage = () => {
    const classes = useStyles();
    const { cluster } = useParams<{ cluster: string, source?: string, category?: string }>();
    
    const [searchParams] = useSearchParams();
    const source = searchParams.get('source') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const { value: dashboard, loading, error } = useDashboard(cluster, source, category);

    const pageTitle = dashboard ? `Cluster: ${dashboard?.title}` : '';

    if (!cluster) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster="" source={source} category={category}>
                <Container>
                    <Text variant="body-small">No cluster specified in URL.</Text>
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (loading) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster} source={source} category={category}>
                <Container>
                    <Progress />
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (error) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster} source={source} category={category}>
                <Container>
                    <Text variant="body-small" color="danger">Error: {error?.message}</Text>
                </Container>
            </PolicyReporterSidebar>
        );
    }

    const total = {
        pass: dashboard?.total.perResult.pass ?? 0,
        fail: dashboard?.total.perResult.fail ?? 0,
        warn: dashboard?.total.perResult.warn ?? 0,
        error: dashboard?.total.perResult.error ?? 0,
    };

    const clusterStats = Object.values(dashboard?.charts.clusterScope || {}).reduce((acc, value) => {
        acc.pass += value.pass ?? 0;
        acc.fail += value.fail ?? 0;
        acc.warn += value.warn ?? 0;
        acc.error += value.error ?? 0;
        return acc;
    }, {
        pass: 0,
        fail: 0,
        warn: 0,
        error: 0,
    });

    const clusterResults = Object.values(clusterStats).reduce((acc, value) => {
        return acc + value;
    }, 0) > 0;

    const data: NamespaceRow[] = dashboard?.summary.items.map((namespace) => ({
        name: namespace.name,
        id: namespace.name,
        pass: namespace.status.pass ?? 0,
        fail: namespace.status.fail ?? 0,
        warn: namespace.status.warn ?? 0,
        error: namespace.status.error ?? 0,
        skip: namespace.status.skip ?? 0,
    })) ?? [];

    return (
        <PolicyReporterSidebar title={pageTitle} cluster={cluster} source={source} category={category}>
            <Content>
                <StatGrid stats={total} />
                {clusterResults && (
                    <Card className={classes.section}>
                        <CardHeader>
                            <Text variant="title-small">Cluster Scoped Resources</Text>
                        </CardHeader>
                        <CardBody>
                            <ClusterResourcesTable cluster={cluster} source={source} category={category} />
                        </CardBody>
                    </Card>
                )}
                {data.length > 0 && <Card className={classes.section}>
                    <CardHeader>
                        <Text variant="title-small">Namespaces</Text>
                    </CardHeader>
                    <CardBody>
                        <NamespaceTable data={data} resourceLink={(namespace) => resourceLink(cluster, namespace.name, source, category)} />
                    </CardBody>
                </Card>}
            </Content>
        </PolicyReporterSidebar>
    );
};
