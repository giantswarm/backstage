import { Box, Chip, Typography } from '@material-ui/core';
import { Finding } from '../apis';

/**
 * The findings of the engine or the inventory, one per line: the kind, the
 * message, and the fix where the manager knows one.
 */
export function FindingsList({
  findings,
  'data-testid': testId,
}: {
  findings: Finding[];
  'data-testid'?: string;
}) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gridGap={12}
      data-testid={testId}
    >
      {findings.map((finding, index) => (
        <Box
          key={`${finding.kind}-${index}`}
          display="flex"
          alignItems="flex-start"
          gridGap={12}
        >
          <Chip
            size="small"
            variant="outlined"
            label={finding.kind}
            style={{ marginBottom: 0, flexShrink: 0 }}
          />
          <Box minWidth={0}>
            <Typography variant="body2">{finding.message}</Typography>
            {finding.fix && (
              <Typography variant="body2" color="textSecondary">
                Fix: {finding.fix}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
