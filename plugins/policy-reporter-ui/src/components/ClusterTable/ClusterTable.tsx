import { Progress } from '@backstage/core-components';
import { Header, Container, Table as Table, useTable, TableItem, ColumnConfig, Cell, CellText } from '@backstage/ui';
import { useClusterDashboard } from '../../hooks/useClusterDashboard';
import { StatusComponent } from '../StatusComponent';
import { Config } from '@internal/backstage-plugin-policy-reporter-common';
import { PropsWithChildren } from 'react';

const columns: ColumnConfig<any>[] = [
    { 
        label: 'Cluster', 
        id: 'name',
        width: '4fr',
        isRowHeader: true,
        cell: (rowData: any) => (
            <CellText title={rowData.name} href={`/policy-reporter-ui/clusters/${rowData.slug || rowData.name}`} />
        ),
    },
    { label: 'Pass', id: 'pass', width: '1fr', cell: item => (<Cell><StatusComponent status="pass" value={item.pass} /></Cell>) },
    { label: 'Fail', id: 'fail', width: '1fr', cell: item => (<Cell><StatusComponent status="fail" value={item.fail} /></Cell>) },
    { label: 'Warn', id: 'warn', width: '1fr', cell: item => (<Cell><StatusComponent status="warn" value={item.warn} /></Cell>) },
    { label: 'Error', id: 'error', width: '1fr', cell: item => (<Cell><StatusComponent status="error" value={item.error} /></Cell>) },
];


export const ClusterTable = ({ config }: PropsWithChildren<{ config: Config }>) => {
    const { value: dashboard, loading, error } = useClusterDashboard();


    const rows = (config.clusters ?? []).map<TableItem>((cluster) => {
        const index = dashboard?.charts.clusters!.complete.labels.findIndex((c) => c === cluster.name) ?? -1;
        
        return {
            id: cluster.slug,
            name: cluster.name,
            slug: cluster.slug,
            pass: dashboard?.charts.clusters!.complete.datasets[0].data[index] ?? 0,
            fail: dashboard?.charts.clusters!.complete.datasets[1].data[index] ?? 0,
            warn: dashboard?.charts.clusters!.complete.datasets[2]?.data[index] ?? 0,
            error: dashboard?.charts.clusters!.complete.datasets[3]?.data[index] ?? 0
        };
    });


    const { tableProps } = useTable({
        mode: 'complete',
        data: rows,
        paginationOptions: {
            type: 'none',
        }
    });

    if (loading) {
        return <Progress />;
    }

    if (error) {
        return (
            <>
                <Header title="Clusters" />
                <Container>
                    <p>Error: {error?.message}</p>
                </Container>
            </>
        );
    }

    return (<Table columnConfig={columns} {...tableProps} />);
};
