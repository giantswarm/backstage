import { Progress, Content } from '@backstage/core-components';
import { Container, Text, Card, CardHeader, CardBody } from '@backstage/ui';
import { useCustomBoard } from '../../hooks/useCustomBoard';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { NamespaceResourcesTable } from './NamespaceResourcesTable';
import { StatGrid } from '../Shared';
import { useParams } from 'react-router-dom';

export const NamespacePage = () => {
    const { cluster, customBoard, namespace } = useParams<{ cluster: string, customBoard: string; namespace: string }>();

    const { value: dashboard, loading, error } = useCustomBoard(cluster, customBoard, namespace);

    const pageTitle = dashboard ? `Cluster: ${dashboard?.title}` : '';

    if (!cluster || !customBoard || !namespace) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster="">
                <Container>
                    <Text variant="body-small">No cluster specified in URL.</Text>
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (loading) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster}>
                <Container>
                    <Progress />
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (error) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster}>
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
        <PolicyReporterSidebar title={`Namespace: ${namespace}`} cluster={cluster}>
            <Content>
                <StatGrid stats={total} />
                <Card>
                    <CardHeader>
                        <Text variant="title-small">Resources</Text>
                    </CardHeader>
                    <CardBody>
                    <NamespaceResourcesTable cluster={cluster} namespace={namespace} customBoard={customBoard} />
                    </CardBody>
                </Card>
            </Content>
        </PolicyReporterSidebar>
    );
};
