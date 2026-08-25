import { Progress, Content } from '@backstage/core-components';
import { usePolicyDetails } from '../../hooks/usePolicyDetails';
import { Container, Card, CardHeader, CardBody, Text, Grid, Box } from '@backstage/ui';
import { ResultTable } from './ResultTable';
import { useParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { ClusterResultTable } from './ClusterResultTable';

const useStyles = makeStyles(theme => ({
    section: {
        marginBottom: theme.spacing(3),
    },
    line: {
        paddingTop: theme.spacing(1),
        paddingBottom: theme.spacing(1),
        borderBottom: `1px solid ${theme.palette.divider}`,
        '&:first-child': {
            borderTop: `1px solid ${theme.palette.divider}`,
        },
    },
}));

export const DetailsPage = () => {
    const classes = useStyles();
    const { cluster, source, policy } = useParams<{ cluster: string, source: string, policy: string }>();

    const { value, loading, error } = usePolicyDetails(cluster!, source!, policy!);

    const pageTitle = source ? `${value?.title}` : 'Policy Dashboard';

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
                {value?.engine && <Grid.Root columns="2">
                    <Box>
                        <Card className={classes.section}>
                            <CardHeader>
                                <Text variant="title-small">Engine Information</Text>
                            </CardHeader>
                            <CardBody>
                                <Grid.Root columns="2" className={classes.line}>
                                    <Text style={{ fontWeight: 'bold' }}>Name</Text>
                                    <Text>{value?.engine?.name}</Text>
                                </Grid.Root>
                                <Grid.Root columns="2" className={classes.line}>
                                    <Text style={{ fontWeight: 'bold' }}>Min. Version</Text>
                                    <Text>{value?.engine?.version}</Text>
                                </Grid.Root>
                                <Grid.Root columns="2" className={classes.line}>
                                    <Text style={{ fontWeight: 'bold' }}>Subjects</Text>
                                    <Text>{value?.engine?.subjects?.join(', ')}</Text>
                                </Grid.Root>
                            </CardBody>
                        </Card>
                        {value?.details && <Card className={classes.section}>
                            <CardHeader>
                                <Text variant="title-small">Details</Text>
                            </CardHeader>
                            <CardBody>
                                {value?.details.map((detail, index) => (
                                    <Grid.Root columns="2" className={classes.line} key={index}>
                                        <Text style={{ fontWeight: 'bold' }}>{detail.title}</Text>
                                        <Text>{detail.value}</Text>
                                    </Grid.Root>
                                ))}
                            </CardBody>
                        </Card>}
                    </Box>
                    <Card className={classes.section}>
                        <CardHeader>
                            <Text variant="title-small">Description</Text>
                        </CardHeader>
                        <CardBody>
                            <Text variant="body-medium">{value?.description}</Text>
                        </CardBody>
                    </Card>
                </Grid.Root>}
                <ClusterResultTable cluster={cluster} source={source!} policy={policy!} />
                {value?.namespaces.map((namespace) => (
                    <Card className={classes.section} key={namespace}>
                        <CardHeader>
                            <Text variant="title-small">{namespace}</Text>
                        </CardHeader>
                        <CardBody>
                            <ResultTable cluster={cluster} source={source!} policy={policy!} namespace={namespace} />
                        </CardBody>
                    </Card>
                ))}
            </Content>
        </PolicyReporterSidebar>
    );
};
