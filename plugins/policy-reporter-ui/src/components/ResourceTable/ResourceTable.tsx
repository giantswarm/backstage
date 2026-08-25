import { Progress } from '@backstage/core-components';
import { Container, Text, Table, ColumnConfig, useTable, CellText, Cell } from '@backstage/ui';
import { StatusComponent } from '../StatusComponent';

import type { PropsWithChildren } from 'react';
import { useResourceResults } from '../../hooks/useResourceResults';
import { ListResult } from '@internal/backstage-plugin-policy-reporter-common';

export const ResourceTable = ({ cluster, resource, source, category }: PropsWithChildren<{ cluster: string; resource: string; source: string; category: string }>) => {
    const { value, loading, error } = useResourceResults(cluster, resource, source, category);

    const columns: ColumnConfig<ListResult>[] = [
        {
            label: 'Policy',
            id: 'policy',
            width: '40%',
            isRowHeader: true,
            cell: item => (<CellText title={item.policy} />),
        },
        { label: 'Rule', id: 'rule', width: '20%', cell: item => (<CellText title={item.rule} />) },
        { label: 'Severity', id: 'severity', width: '20%', cell: item => (<CellText title={item.severity} />) },
        { label: 'Status', id: 'status', width: '20%', cell: item => (<Cell><StatusComponent status={item.status} /></Cell>) },
    ];

    const { tableProps } = useTable({
        mode: 'complete',
        data: value?.items ?? [],
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
