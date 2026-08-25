import { Progress, Content } from '@backstage/core-components';
import { Container, Text, Card, CardBody, CardHeader } from '@backstage/ui';
import { useParams, useSearchParams } from 'react-router-dom';
import { useDashboard } from '../../hooks/useDashboard';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { NamespaceResourcesTable } from '../NamespaceResourcesTable';
import { StatGrid } from '../Shared';

export const NamespaceDashboardPage = () => {
    const { cluster, namespace } = useParams<{ cluster: string, namespace: string }>();

    const [searchParams] = useSearchParams();
    const source = searchParams.get('source') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const { value: dashboard, loading, error } = useDashboard(cluster, source, category, namespace);

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

    return (
        <PolicyReporterSidebar title={`Namespace: ${namespace}`} cluster={cluster} source={source} category={category}>
            <Content>
                <StatGrid stats={total} />
                <Card>
                    <CardHeader>
                        <Text variant="title-small">Resources</Text>
                    </CardHeader>
                    <CardBody>
                        <NamespaceResourcesTable cluster={cluster} namespace={namespace || ''} source={source} category={category} />
                    </CardBody>
                </Card>
            </Content>
        </PolicyReporterSidebar>
    );
};
