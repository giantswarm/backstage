import { Progress } from '@backstage/core-components';
import { Container, Text, Table, ColumnConfig, useTable, CellText, Cell, Card, CardHeader, CardBody } from '@backstage/ui';
import { StatusComponent } from '../StatusComponent';
import { useClusterScopeResults } from '../../hooks/useClusterResults';
import type { PropsWithChildren } from 'react';
import type { ListResult } from '@internal/backstage-plugin-policy-reporter-common';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
    section: {
        marginBottom: theme.spacing(3),
    },
}));

export const ClusterResultTable = ({ cluster, source, policy }: PropsWithChildren<{ cluster: string; source: string; policy: string }>) => {
    const classes = useStyles();

    const { value, loading, error } = useClusterScopeResults(cluster, source, policy);

    const columns: ColumnConfig<ListResult>[] = [
        {
            label: 'APIVersion',
            id: 'apiVersion',
            width: '10%',
            isRowHeader: true,
            cell: item => (<CellText title={item.apiVersion} />),
        },
        {
            label: 'Kind',
            id: 'kind',
            width: '10%',
            isRowHeader: true,
            cell: item => (<CellText title={item.kind} />),
        },
        {
            label: 'Name',
            id: 'name',
            width: '40%',
            isRowHeader: true,
            cell: item => (<CellText title={item.name} />),
        },
        {
            label: 'Rule',
            id: 'rule',
            width: '20%',
            isRowHeader: true,
            cell: item => (<CellText title={item.rule} />),
        },
        {
            label: 'Severity',
            id: 'severity',
            width: '10%',
            isRowHeader: true,
            cell: item => (<CellText title={item.severity} />),
        },
        {
            label: 'Status',
            id: 'status',
            width: '10%',
            isRowHeader: true,
            cell: item => (<Cell><StatusComponent status={item.status} /></Cell>),
        },
    ];

    const { tableProps } = useTable({
        mode: 'complete',
        data: value?.items || [],
        paginationOptions: {
            type: 'none',
        }
    });

    if (loading) {
        return (
            <Container>
                <Progress />
            </Container>
        );
    }

    if (error) {
        return (
            <Container>
                <Text variant="body-small" color="danger">Error: {error?.message}</Text>
            </Container>
        );
    }

    if (tableProps.data?.length === 0) {
        return <></>;
    }

    return (
        <Card className={classes.section}>
            <CardHeader>
                <Text variant="title-small">Cluster Scoped Results</Text>
            </CardHeader>
            <CardBody>
                <Table {...tableProps} columnConfig={columns} />
            </CardBody>
        </Card>
    );
};
