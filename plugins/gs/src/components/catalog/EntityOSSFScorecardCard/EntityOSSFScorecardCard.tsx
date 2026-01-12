import { useEntity } from '@backstage/plugin-catalog-react';
import { InfoCard, Progress } from '@backstage/core-components';
import { useQuery } from '@tanstack/react-query';
import { Box, Chip, Link, Typography } from '@material-ui/core';
import { Link as RouterLink } from 'react-router-dom';
import { useRouteRef } from '@backstage/core-plugin-api';
import { entityRouteRef } from '@backstage/plugin-catalog-react';
import { getGithubProjectSlugFromEntity } from '../../utils/entity';
import { QueryClientProvider } from '../../QueryClientProvider';

interface ScorecardData {
  score: number;
}

const CardContent = () => {
  const { entity } = useEntity();
  const githubProjectSlug = getGithubProjectSlugFromEntity(entity);

  const entityRoute = useRouteRef(entityRouteRef);
  const scorecardUrl = entityRoute({
    kind: entity.kind.toLowerCase(),
    namespace: entity.metadata.namespace?.toLowerCase() ?? 'default',
    name: entity.metadata.name,
  }) + '/ossf-scorecard';

  const { data, isLoading } = useQuery<ScorecardData>({
    queryKey: ['ossf-scorecard-preview', githubProjectSlug],
    queryFn: async () => {
      if (!githubProjectSlug) {
        throw new Error('No GitHub project slug found');
      }

      const apiProjectPath = githubProjectSlug.startsWith('github.com/')
        ? githubProjectSlug
        : `github.com/${githubProjectSlug}`;
      const apiUrl = `https://api.scorecard.dev/projects/${apiProjectPath}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch scorecard data: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: Boolean(githubProjectSlug),
    retry: 1,
  });

  if (!githubProjectSlug) {
    return null;
  }

  if (isLoading) {
    return (
      <InfoCard title="OSSF Scorecard">
        <Progress />
      </InfoCard>
    );
  }

  if (!data) {
    return null;
  }

  const getScoreColor = (score: number): 'default' | 'primary' | 'secondary' => {
    if (score >= 8) return 'primary';
    if (score >= 5) return 'secondary';
    return 'default';
  };

  return (
    <InfoCard title="OSSF Scorecard">
      <Box display="flex" alignItems="center" style={{ gap: '12px', marginBottom: '12px' }}>
        <Chip
          label={`${data.score.toFixed(1)} / 10`}
          color={getScoreColor(data.score)}
          size="small"
        />
      </Box>
      <Link component={RouterLink} to={scorecardUrl}>
        <Typography variant="body2" color="primary">
          View details →
        </Typography>
      </Link>
    </InfoCard>
  );
};

export const EntityOSSFScorecardCard = () => {
  return (
    <QueryClientProvider>
      <CardContent />
    </QueryClientProvider>
  );
};
