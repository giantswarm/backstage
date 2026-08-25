import { Progress } from '@backstage/core-components';
import { Container, Text, Table, ColumnConfig, useTable, CellText, Cell } from '@backstage/ui';
import { StatusComponent } from '../StatusComponent';
import type { PropsWithChildren } from 'react';
import type { ListResult } from '@internal/backstage-plugin-policy-reporter-common';
import { useNamespaceResults } from '../../hooks/useNamespaceResults';

export const ResultTable = ({ cluster, source, namespace, policy }: PropsWithChildren<{ cluster: string; source: string; namespace: string; policy: string }>) => {
    const { value, loading, error } = useNamespaceResults(cluster, namespace, source, policy);

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

    return (<Table columnConfig={columns} {...tableProps} />);
};
