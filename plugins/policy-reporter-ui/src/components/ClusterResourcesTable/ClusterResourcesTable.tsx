import { Progress } from '@backstage/core-components';
import { Text, Table, ColumnConfig, Cell, useTable, CellText } from '@backstage/ui';
import { Container } from '@backstage/ui';
import { StatusComponent } from '../StatusComponent';
import type { PropsWithChildren } from 'react';
import { useClusterResources } from '../../hooks/useClusterResources';
import { ResourceResult } from '@internal/backstage-plugin-policy-reporter-common';
import { appendQueryParams } from '../../helper/query';

export const ClusterResourcesTable = ({ cluster, source, category }: PropsWithChildren<{ cluster: string; source?: string; category?: string }>) => {
    const { value, loading, error } = useClusterResources(cluster, source, category);

    const columns: ColumnConfig<ResourceResult>[] = [
        {
            label: 'Resource',
            id: 'name',
            width: '50%',
            isRowHeader: true,
            cell: (rowData: ResourceResult) => (<CellText title={rowData.name} href={appendQueryParams(`/policy-reporter-ui/clusters/${cluster}/resources/${rowData.id}`, source, category)} description={`${rowData.apiVersion} ${rowData.kind}`} />),        },
        { label: 'Skip', id: 'status.skip', width: '10%', cell: item => (<Cell><StatusComponent status="skip" value={item.status.skip} /></Cell>) },
        { label: 'Pass', id: 'status.pass', width: '10%', cell: item => (<Cell><StatusComponent status="pass" value={item.status.pass} /></Cell>) },
        { label: 'Fail', id: 'status.fail', width: '10%', cell: item => (<Cell><StatusComponent status="fail" value={item.status.fail} /></Cell>) },
        { label: 'Warn', id: 'status.warn', width: '10%', cell: item => (<Cell><StatusComponent status="warn" value={item.status.warn} /></Cell>) },
        { label: 'Error', id: 'status.error', width: '10%', cell: item => (<Cell><StatusComponent status="error" value={item.status.error} /></Cell>) },
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
