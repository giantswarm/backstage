import { useMemo, useState } from 'react';
import { Table } from '@backstage/core-components';
import { Box, Flex, Switch, Text } from '@backstage/ui';
import { useTableColumns } from '@giantswarm/backstage-plugin-ui-react';
import { useHelmChartTags } from '../../hooks/useHelmChartTags';
import { OciTagData, getOciTagColumns } from './columns';
import {
  isStableVersion,
  parseChartRef,
} from '@giantswarm/backstage-plugin-gs-common';

const TABLE_ID = 'oci-tags';

export type OciTagsTableProps = {
  ociRepository: string;
  name: string;
};

export const OciTagsTable = ({ ociRepository, name }: OciTagsTableProps) => {
  const [showAll, setShowAll] = useState(false);
  const { tags, latestStableVersion, isLoading, error } =
    useHelmChartTags(ociRepository);

  const { visibleColumns } = useTableColumns(TABLE_ID);

  const tableData: OciTagData[] = useMemo(() => {
    if (!tags) {
      return [];
    }

    return tags
      .filter(tagInfo => showAll || isStableVersion(tagInfo.tag))
      .map(tagInfo => ({
        tag: tagInfo.tag,
        isLatest: tagInfo.tag === latestStableVersion,
        createdAt: tagInfo.createdAt,
      }));
  }, [tags, latestStableVersion, showAll]);

  const totalCount = tags?.length ?? 0;
  const countLabel =
    tableData.length === totalCount
      ? `${totalCount}`
      : `${tableData.length} of ${totalCount}`;

  const columns = useMemo(
    () => getOciTagColumns(visibleColumns),
    [visibleColumns],
  );

  let emptyContent = null;
  if (totalCount > 0) {
    emptyContent = (
      <Box px="4" py="14">
        <Text color="secondary">
          No stable releases yet. Turn on Show all to see release candidates and
          dev builds.
        </Text>
      </Box>
    );
  }
  if (error) {
    if (error.name !== 'NotFoundError') {
      return <Text color="danger">{error.message}</Text>;
    }

    const { repository } = parseChartRef(ociRepository);
    emptyContent = (
      <Box px="4" py="14">
        <Text color="secondary">
          The repository <code>{repository}</code> is not available in the
          registry.
        </Text>
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
        <Flex align="center" gap="6">
          <Text as="span" variant="title-small" weight="bold">
            Versions of {name} ({countLabel})
          </Text>
          {totalCount > 0 && (
            <Switch
              label="Show all"
              isSelected={showAll}
              onChange={setShowAll}
            />
          )}
        </Flex>
      }
      columns={columns}
      emptyContent={emptyContent}
    />
  );
};
