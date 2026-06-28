import { Box, Typography, makeStyles, Theme } from '@material-ui/core';
import { Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { ToolList } from '../shared';
import { ToolSummary } from '../../apis/types';

const useStyles = makeStyles((theme: Theme) => ({
  family: {
    marginBottom: theme.spacing(3),
  },
  familyHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  familyTitle: {
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  count: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontVariantNumeric: 'tabular-nums',
  },
  note: {
    color: theme.palette.text.secondary,
  },
}));

/** Pretty labels for the known core families; falls back to the raw segment. */
const FAMILY_LABELS: Record<string, string> = {
  workflow: 'Workflows',
  service: 'Services',
  config: 'Configuration',
  mcpserver: 'MCP server definitions',
  auth: 'Authentication',
};

type Family = { key: string; label: string; tools: ToolSummary[] };

/** Group `core_<family>_<verb>` tools by their family segment. */
function groupByFamily(tools: ToolSummary[]): Family[] {
  const byKey = new Map<string, ToolSummary[]>();
  for (const tool of tools) {
    const parts = tool.name.split('_');
    const key = parts[0] === 'core' && parts.length > 1 ? parts[1] : 'other';
    byKey.set(key, [...(byKey.get(key) ?? []), tool]);
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({
      key,
      label: FAMILY_LABELS[key] ?? key,
      tools: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface CoreFamiliesPanelProps {
  installation?: string;
}

/**
 * The muster-core tool families: `list_core_tools` grouped by `core_<family>_*`
 * prefix. These are provided by muster directly (no backend server to
 * federate), so the panel is mostly static reference. Requires an authenticated
 * session (the caller gates this behind auth).
 */
export function CoreFamiliesPanel({ installation }: CoreFamiliesPanelProps) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'core-tools', installation],
    queryFn: () => musterApi.listCoreTools(installation),
    enabled: Boolean(installation),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return (
      <Typography variant="body2" className={classes.note}>
        Core tools unavailable: {(error as Error).message}
      </Typography>
    );
  }

  const families = groupByFamily(data?.tools ?? []);
  if (families.length === 0) {
    return (
      <Typography variant="body2" className={classes.note}>
        No core tools reported by this muster instance.
      </Typography>
    );
  }

  return (
    <Box>
      {families.map(family => (
        <Box key={family.key} className={classes.family}>
          <Box className={classes.familyHeader}>
            <Typography variant="body2" className={classes.familyTitle}>
              {family.label}
            </Typography>
            <span className={classes.count}>{family.tools.length} tools</span>
          </Box>
          <ToolList
            tools={family.tools.map(t => ({
              name: t.name,
              description: t.summary ?? t.description,
            }))}
          />
        </Box>
      ))}
    </Box>
  );
}
