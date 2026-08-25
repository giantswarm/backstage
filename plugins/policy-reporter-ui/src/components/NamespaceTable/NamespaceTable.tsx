import { Table, useTable, ColumnConfig, Cell, CellText } from '@backstage/ui';
import { StatusComponent } from '../StatusComponent';

export type NamespaceRow = {
    name: string;
    id: string;
    pass: number;
    fail: number;
    warn: number;
    error: number;
    skip: number;
};

export const NamespaceTable = ({ data, resourceLink }: { data: NamespaceRow[], resourceLink: (r: NamespaceRow) => string }) => {
    const columns: ColumnConfig<NamespaceRow>[] = [
        {
            label: 'Namespace',
            id: 'name',
            width: '50%',
            isRowHeader: true,
            cell: (rowData: NamespaceRow) => (
                <CellText title={rowData.name} href={resourceLink(rowData)} description="v1 Namespace" />
            ),
        },
        { label: 'Skip', id: 'skip', width: '10%', cell: item => (<Cell><StatusComponent status="skip" value={item.skip} /></Cell>) },
        { label: 'Pass', id: 'pass', width: '10%', cell: item => (<Cell><StatusComponent status="pass" value={item.pass} /></Cell>) },
        { label: 'Fail', id: 'fail', width: '10%', cell: item => (<Cell><StatusComponent status="fail" value={item.fail} /></Cell>) },
        { label: 'Warn', id: 'warn', width: '10%', cell: item => (<Cell><StatusComponent status="warn" value={item.warn} /></Cell>) },
        { label: 'Error', id: 'error', width: '10%', cell: item => (<Cell><StatusComponent status="error" value={item.error} /></Cell>) },
    ];

    const { tableProps } = useTable({
        mode: 'complete',
        data: data,
        paginationOptions: {
            type: 'none',
        }
    });

    return (<Table columnConfig={columns} {...tableProps} />);
};
