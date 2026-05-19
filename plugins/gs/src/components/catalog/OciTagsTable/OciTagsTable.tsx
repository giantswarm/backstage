import { useMemo } from 'react';
import { Table } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { OciTagData, getOciTagColumns } from './columns';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';

const TABLE_ID = 'oci-tags';

export type OciTagsTableProps = {
  ociRepository: string;
  name: string;
};

export const OciTagsTable = ({ ociRepository, name }: OciTagsTableProps) => {
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(ociRepository);

  const { visibleColumns } = useTableColumns(TABLE_ID);

  const tableData: OciTagData[] = useMemo(() => {
    if (!tags) {
      return [];
    }

    return tags.map(tagInfo => ({
      tag: tagInfo.tag,
      isLatest: tagInfo.tag === latestStableVersion,
      createdAt: tagInfo.createdAt,
    }));
  }, [tags, latestStableVersion]);

  const columns = useMemo(
    () => getOciTagColumns(visibleColumns),
    [visibleColumns],
  );

  let emptyContent = null;
  if (error) {
    if (error.name !== 'NotFoundError') {
      return <Typography color="error">{error.message}</Typography>;
    }

    const { repository } = parseChartRef(ociRepository);
    emptyContent = (
      <Box px={2} py={8}>
        <Typography variant="inherit" color="textSecondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Typography>
      </Box>
    );
  }

  return (
    <Table<OciTagData>
      isLoading={isLoading}
      options={{
        pageSize: 50,
        pageSizeOptions: [10, 25, 50, 100],
        emptyRowsWhenPaging: false,
        columnsButton: true,
      }}
      data={tableData}
      style={{ width: '100%' }}
      title={
        <Typography variant="h6">
          Versions of {name} ({tableData.length})
        </Typography>
      }
      columns={columns}
      emptyContent={emptyContent}
    />
  );
};
