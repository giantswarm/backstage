import { Progress, Content } from '@backstage/core-components';
import { Container, Card, CardHeader, CardBody, Text } from '@backstage/ui';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePolicySources } from '../../hooks/usePolicySources';
import { Divider, makeStyles } from '@material-ui/core';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { PolicyTable } from './PolicyTable';

const useStyles = makeStyles(theme => ({
    section: {
        marginBottom: theme.spacing(3),
    },
}));

export const DashboardPage = () => {
    const classes = useStyles();
    const { cluster } = useParams<{ cluster: string, resource: string }>();
    
    const [searchParams] = useSearchParams();
    const source = searchParams.get('source') ?? undefined;

    const { value: dashboard, loading, error } = usePolicySources(cluster!, source);

    const pageTitle = source ? `${dashboard?.sources[0].title} Policies` : 'Policy Dashboard';

    if (!cluster) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster="" source={source}>
                <Container>
                    <Text variant="body-small">No cluster or resource specified in URL.</Text>
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (loading) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster} source={source}>
                <Container>
                    <Progress />
                </Container>
            </PolicyReporterSidebar>
        );
    }

    if (error) {
        return (
            <PolicyReporterSidebar title={pageTitle} cluster={cluster} source={source}>
                <Container>
                    <Text variant="body-small" color="danger">Error: {error?.message}</Text>
                </Container>
            </PolicyReporterSidebar>
        );
    }

    return (
        <PolicyReporterSidebar cluster={cluster} source={source} title={pageTitle}>
            <Content>
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
                                <CardBody>
                                    <PolicyTable cluster={cluster} source={s.name} category={c} />
                                </CardBody>
                            </div>
                        ))}
                        </CardBody>
                    </Card>
                ))}
            </Content>
        </PolicyReporterSidebar>
    );
};
