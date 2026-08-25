import { Progress, Content } from '@backstage/core-components';
import { Container, Card, CardHeader, CardBody, Text } from '@backstage/ui';
import { StatGrid } from '../Shared';
import { useParams, useSearchParams } from 'react-router-dom';
import { useResourceDetails } from '../../hooks/useResourceDetails';
import { Divider, makeStyles } from '@material-ui/core';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { ResourceTable } from '../ResourceTable';

const useStyles = makeStyles(theme => ({
    section: {
        marginTop: theme.spacing(3),
        marginBottom: theme.spacing(2),
    },
}));

export const ResourceDashboardPage = () => {
    const classes = useStyles();
    const { cluster, resource } = useParams<{ cluster: string, resource: string }>();
    
    const [searchParams] = useSearchParams();
    const source = searchParams.get('source') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const { value: dashboard, loading, error } = useResourceDetails(cluster!, resource!, source, category);

    const pageTitle = dashboard ? `${dashboard?.resource.name}` : '';

    if (!cluster || !resource) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster="" source={source} category={category}>
                <Container>
                    <Text variant="body-small">No cluster or resource specified in URL.</Text>
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

    return (
        <PolicyReporterSidebar title={dashboard?.resource.namespace ? `${dashboard?.resource.namespace}/${dashboard?.resource.name}` : dashboard?.resource.name} cluster={cluster} subtitle={`${dashboard?.resource.apiVersion} ${dashboard?.resource.kind}`} source={source} category={category}>
            <Content>
                <StatGrid stats={dashboard?.results ?? { pass: 0, fail: 0, warn: 0, error: 0 }} />
                {dashboard?.sources.map((s) => (
                    <Card className={classes.section} key={s.name}>
                        <CardHeader>
                            <Text variant="title-small">{s.title}</Text>
                        </CardHeader>
                        <CardBody>
                        {s.categories.map((c) => (
                            <div key={c} style={{ marginBottom: 24 }}>
                                <Divider style={{ marginBottom: 16 }} />
                                <Text variant="title-x-small">{c}</Text>
                                <Divider style={{ marginTop: 16, marginBottom: 8 }} />
                                <ResourceTable cluster={cluster} resource={resource} source={s.name} category={c} />
                            </div>
                        ))}
                        </CardBody>
                    </Card>
                ))}
            </Content>
        </PolicyReporterSidebar>
    );
};
