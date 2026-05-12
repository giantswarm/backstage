import { useMemo } from 'react';
import { Table } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { Box, Typography } from '@material-ui/core';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { QueryClientProvider } from '../../QueryClientProvider';
import { getKlausPersonalityImageFromEntity } from '../../utils/entity';
import { parseChartRef } from '../../utils/parseChartRef';
import {
  type ChartTagData,
  getChartTagColumns,
} from '../EntityVersionHistoryContent/ChartTagsTable';

const TABLE_ID = 'klaus-personality-tags';

const KlausPersonalityTagsTable = () => {
  const { entity } = useEntity();
  const imageRef = getKlausPersonalityImageFromEntity(entity);
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(imageRef);

  const { visibleColumns } = useTableColumns(TABLE_ID);

  const tableData: ChartTagData[] = useMemo(() => {
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
    () => getChartTagColumns(visibleColumns),
    [visibleColumns],
  );

  if (!imageRef) {
    return (
      <Box px={2} py={8}>
        <Typography variant="inherit" color="textSecondary">
          No <code>giantswarm.io/klaus-personality-image</code> annotation set
          on this entity.
        </Typography>
      </Box>
    );
  }

  let emptyContent = null;
  if (error) {
    if (error.name !== 'NotFoundError') {
      return <Typography color="error">{error.message}</Typography>;
    }

    const { repository } = parseChartRef(imageRef);
    emptyContent = (
      <Box px={2} py={8}>
        <Typography variant="inherit" color="textSecondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Typography>
      </Box>
    );
  }

  const { name: personalityName } = parseChartRef(imageRef);

  return (
    <Table<ChartTagData>
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
          Versions of {personalityName} ({tableData.length})
        </Typography>
      }
      columns={columns}
      emptyContent={emptyContent}
    />
  );
};

export const EntityKlausPersonalityVersionHistoryContent = () => {
  return (
    <QueryClientProvider>
      <KlausPersonalityTagsTable />
    </QueryClientProvider>
  );
};
