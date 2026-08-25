import { Progress, Content } from '@backstage/core-components';
import { Container, Text, Table, useTable, ColumnConfig, Cell, CellText, Card, CardBody, CardHeader } from '@backstage/ui';
import { StatGrid } from '../Shared';
import { useParams, useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core';
import { useCustomBoard } from '../../hooks/useCustomBoard';
import { StatusComponent } from '../StatusComponent';
import { PolicyReporterSidebar } from '../PolicyReporterSidebar';
import { ClusterResourcesTable } from './ClusterResourcesTable';

const useStyles = makeStyles(theme => ({
    section: {
        marginTop: theme.spacing(3),
        marginBottom: theme.spacing(2),
    },
}));

export const Dashboard = () => {
    const classes = useStyles();
    const { cluster, customBoard } = useParams<{ cluster: string, customBoard: string }>();
    
    const [searchParams] = useSearchParams();
    const source = searchParams.get('source') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const { value: dashboard, loading, error } = useCustomBoard(cluster, customBoard);

    type NamespaceRow = {
        name: string;
        id: string;
        pass: number;
        fail: number;
        warn: number;
        error: number;
        skip: number;
    };

    const columns: ColumnConfig<NamespaceRow>[] = [
        {
            label: 'Namespace',
            id: 'name',
            width: '50%',
            isRowHeader: true,
            cell: (rowData: NamespaceRow) => (
                <CellText href={`/policy-reporter-ui/clusters/${cluster}/custom-board/${customBoard}/namespace/${rowData.name}`} title={rowData.name} description="v1 Namespace" />
            ),
        },
        { label: 'Skip', id: 'skip', width: '10%', cell: item => (<Cell><StatusComponent status="skip" value={item.skip} /></Cell>) },
        { label: 'Pass', id: 'pass', width: '10%', cell: item => (<Cell><StatusComponent status="pass" value={item.pass} /></Cell>) },
        { label: 'Fail', id: 'fail', width: '10%', cell: item => (<Cell><StatusComponent status="fail" value={item.fail} /></Cell>) },
        { label: 'Warn', id: 'warn', width: '10%', cell: item => (<Cell><StatusComponent status="warn" value={item.warn} /></Cell>) },
        { label: 'Error', id: 'error', width: '10%', cell: item => (<Cell><StatusComponent status="error" value={item.error} /></Cell>) },
    ];


    const data: NamespaceRow[] = (dashboard?.summary?.items || []).map((namespace) => ({
        name: namespace.name,
        id: namespace.name,
        pass: namespace.status.pass ?? 0,
        fail: namespace.status.fail ?? 0,
        warn: namespace.status.warn ?? 0,
        error: namespace.status.error ?? 0,
        skip: namespace.status.skip ?? 0,
    }));

    const { tableProps } = useTable({
        mode: 'complete',
        data: data,
        paginationOptions: {
            type: 'none',
        }
    })

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
        pass: dashboard?.total.perResult?.pass ?? 0,
        fail: dashboard?.total.perResult?.fail ?? 0,
        warn: dashboard?.total.perResult?.warn ?? 0,
        error: dashboard?.total.perResult?.error ?? 0,
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
                            <ClusterResourcesTable cluster={cluster} customBoard={customBoard!} />
                        </CardBody>
                    </Card>
                )}
                {!!tableProps.data?.length && <Card className={classes.section}>
                    <CardHeader>
                        <Text variant="title-small">Namespaces</Text>
                    </CardHeader>
                    <CardBody>
                        <Table {...tableProps} columnConfig={columns} />
                    </CardBody>
                </Card>}
            </Content>
        </PolicyReporterSidebar>
    );
};
