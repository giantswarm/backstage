import { Flex, Text } from '@backstage/ui';

interface UsageBarProps {
  used: number;
  total: number;
  label: string;
}

/**
 * Usage against a ceiling. Local to this tab for now; a candidate to promote
 * into `ui-react` once a second caller appears.
 */
export const UsageBar = ({ used, total, label }: UsageBarProps) => {
  const percent =
    total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <Flex direction="column" gap="0.5">
      <Flex align="center" gap="2">
        <Text variant="body-medium">{label}</Text>
        {total > 0 && (
          <Text variant="body-small" color="secondary">
            {`${percent}%`}
          </Text>
        )}
      </Flex>
      {total > 0 && (
        <div
          style={{
            height: 6,
            borderRadius: 3,
            width: '100%',
            maxWidth: 260,
            background: 'var(--bui-bg-neutral-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              background: 'var(--bui-fg-primary)',
            }}
          />
        </div>
      )}
    </Flex>
  );
};
