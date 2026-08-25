import { Progress } from '@backstage/core-components';
import { Container, Text, Table, ColumnConfig, useTable, CellText, Cell } from '@backstage/ui';
import { usePolicies } from '../../hooks/usePolicies';
import { StatusComponent } from '../StatusComponent';
import type { PropsWithChildren } from 'react';
import type { PolicyResult } from '@internal/backstage-plugin-policy-reporter-common';

interface TableItem extends PolicyResult {
    id: string;
}

export const PolicyTable = ({ cluster, source, category }: PropsWithChildren<{ cluster: string; source: string; category: string }>) => {
    const { value, loading, error } = usePolicies(cluster, source, category);

    const columns: ColumnConfig<TableItem>[] = [
        {
            label: 'Policy',
            id: 'policy',
            width: '50%',
            isRowHeader: true,
            cell: item => (<CellText title={item.title} href={`/policy-reporter-ui/clusters/${cluster}/${source}/policies/${item.name}`} />),
        },
        { label: 'Skip', id: 'results.skip', width: '10%', cell: item => (<Cell><StatusComponent status="skip" value={item.results.skip || 0} /></Cell>) },
        { label: 'Pass', id: 'results.pass', width: '10%', cell: item => (<Cell><StatusComponent status="pass" value={item.results.pass || 0} /></Cell>) },
        { label: 'Fail', id: 'results.fail', width: '10%', cell: item => (<Cell><StatusComponent status="fail" value={item.results.fail || 0} /></Cell>) },
        { label: 'Warn', id: 'results.warn', width: '10%', cell: item => (<Cell><StatusComponent status="warn" value={item.results.warn || 0} /></Cell>) },
        { label: 'Error', id: 'results.error', width: '10%', cell: item => (<Cell><StatusComponent status="error" value={item.results.error || 0} /></Cell>) },
    ];

    const { tableProps } = useTable({
        mode: 'complete',
        data: (value?.[category] ?? []).map((item) => ({ ...item, id: item.name })),
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
