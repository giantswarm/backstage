import { useEntity } from '@backstage/plugin-catalog-react';
import {
  Content,
  EmptyState,
  Progress,
  ErrorPanel,
} from '@backstage/core-components';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Grid,
  Typography,
  Box,
  Chip,
  Link,
  Button,
  Collapse,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ExpandLessIcon from '@material-ui/icons/ExpandLess';
import CheckIcon from '@material-ui/icons/Check';
import { getGithubProjectSlugFromEntity } from '../../utils/entity';
import { QueryClientProvider } from '../../QueryClientProvider';

interface ScorecardCheck {
  name: string;
  score: number;
  reason: string;
  details?: string[];
  documentation: {
    short: string;
    url: string;
  };
}

interface ScorecardData {
  date: string;
  repo: {
    name: string;
    commit: string;
  };
  scorecard: {
    version: string;
    commit: string;
  };
  score: number;
  checks: ScorecardCheck[];
}

const MAX_VISIBLE_DETAILS = 5;

const ScorecardContent = () => {
  const { entity } = useEntity();
  const githubProjectSlug = getGithubProjectSlugFromEntity(entity);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<ScorecardData>({
    queryKey: ['ossf-scorecard', githubProjectSlug],
    queryFn: async () => {
      if (!githubProjectSlug) {
        throw new Error('No GitHub project slug found');
      }

      // The annotation value is "owner/repo", but API expects "github.com/owner/repo"
      const apiProjectPath = githubProjectSlug.startsWith('github.com/')
        ? githubProjectSlug
        : `github.com/${githubProjectSlug}`;
      const apiUrl = `https://api.scorecard.dev/projects/${apiProjectPath}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch scorecard data: ${response.statusText}`,
        );
      }

      return response.json();
    },
    enabled: Boolean(githubProjectSlug),
    retry: 2,
  });

  if (!githubProjectSlug) {
    return (
      <Content>
        <EmptyState
          title="GitHub repository not found"
          missing="info"
          description="This component does not have a GitHub repository associated with it. Please add the 'github.com/project-slug' annotation to enable OSSF Scorecard information."
        />
      </Content>
    );
  }

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  if (error) {
    return (
      <Content>
        <ErrorPanel
          title="Failed to load OSSF Scorecard data"
          error={error instanceof Error ? error : new Error(String(error))}
        />
      </Content>
    );
  }

  if (!data) {
    return (
      <Content>
        <EmptyState
          title="No scorecard data available"
          missing="info"
          description="Unable to retrieve OSSF Scorecard data for this repository."
        />
      </Content>
    );
  }

  const getScoreColor = (score: number): string => {
    const colorMap: { [key: number]: string } = {
      10: '#42a832',
      9: '#5c9e2c',
      8: '#6e9326',
      7: '#7d8821',
      6: '#887c1b',
      5: '#927015',
      4: '#9b630f',
      3: '#a25509',
      2: '#a94405',
      1: '#af2e02',
      0: '#b40000',
    };

    // Round score to nearest integer and clamp between 0-10
    const roundedScore = Math.max(0, Math.min(10, Math.round(score)));
    return colorMap[roundedScore] || '#b40000';
  };

  const getCheckScoreColor = (score: number): string => {
    // Use same color mapping for check scores
    return getScoreColor(score);
  };

  // Ensure viewer URL uses the correct format
  const viewerProjectPath = githubProjectSlug.startsWith('github.com/')
    ? githubProjectSlug
    : `github.com/${githubProjectSlug}`;
  const viewerUrl = `https://securityscorecards.dev/viewer/?uri=${viewerProjectPath}`;

  return (
    <Content>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box mb={2}>
            <Box
              display="flex"
              alignItems="baseline"
              style={{ gap: '16px' }}
              mb={1}
            >
              <Typography variant="h4">Overall Score</Typography>
              <Chip
                label={`${data.score.toFixed(1)} / 10`}
                size="medium"
                style={{
                  fontSize: '1.2rem',
                  padding: '8px 16px',
                  backgroundColor: getScoreColor(data.score),
                  color: '#ffffff',
                }}
              />
            </Box>
            <Typography variant="caption" color="textSecondary" display="block">
              Last updated: {new Date(data.date).toLocaleDateString()} •
              Scorecard version: {data.scorecard.version} (commit:{' '}
              {data.scorecard.commit.substring(0, 7)})
            </Typography>
            <Box mt={1}>
              <Link href={viewerUrl} target="_blank" rel="noopener noreferrer">
                View on securityscorecards.dev →
              </Link>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          {/* Separate checks into two groups */}
          {(() => {
            const checksNeedingAttention = data.checks
              .filter(check => check.score < 10)
              .sort((a, b) => {
                // Handle N/A scores (-1) - put them at the bottom
                if (a.score === -1 && b.score === -1) return 0;
                if (a.score === -1) return 1;
                if (b.score === -1) return -1;
                // Sort by score ascending (lowest first)
                return a.score - b.score;
              });
            const passedChecks = data.checks.filter(
              check => check.score === 10,
            );

            return (
              <>
                {/* Checks Requiring Attention */}
                {checksNeedingAttention.length > 0 && (
                  <>
                    <Typography
                      variant="h6"
                      style={{ marginBottom: '8px', fontWeight: 'bold' }}
                    >
                      Checks Requiring Attention
                    </Typography>
                    <Grid container spacing={2}>
                      {checksNeedingAttention.map(check => {
                        const isExpanded = expandedChecks.has(check.name);
                        const hasManyDetails =
                          check.details &&
                          check.details.length > MAX_VISIBLE_DETAILS;
                        const visibleDetails =
                          hasManyDetails && !isExpanded
                            ? check.details!.slice(0, MAX_VISIBLE_DETAILS)
                            : check.details || [];
                        const hiddenCount =
                          hasManyDetails && !isExpanded
                            ? check.details!.length - MAX_VISIBLE_DETAILS
                            : 0;

                        const toggleExpand = () => {
                          const newExpanded = new Set(expandedChecks);
                          if (isExpanded) {
                            newExpanded.delete(check.name);
                          } else {
                            newExpanded.add(check.name);
                          }
                          setExpandedChecks(newExpanded);
                        };

                        return (
                          <Grid item xs={12} md={6} key={check.name}>
                            <Box
                              border={1}
                              borderColor="divider"
                              borderRadius={1}
                              p={2}
                              height="100%"
                              display="flex"
                              flexDirection="column"
                            >
                              <Box
                                display="flex"
                                justifyContent="space-between"
                                alignItems="center"
                                mb={1}
                              >
                                <Typography
                                  variant="subtitle1"
                                  style={{ fontWeight: 'bold' }}
                                >
                                  {check.name}
                                </Typography>
                                <Chip
                                  label={
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      style={{ gap: '8px' }}
                                    >
                                      <span>
                                        {check.score >= 0
                                          ? `${check.score} / 10`
                                          : 'N/A'}
                                      </span>
                                      {check.score === 10 && (
                                        <CheckIcon
                                          style={{
                                            fontSize: '16px',
                                            marginLeft: '4px',
                                          }}
                                        />
                                      )}
                                    </Box>
                                  }
                                  size="small"
                                  style={{
                                    backgroundColor:
                                      check.score >= 0
                                        ? getCheckScoreColor(check.score)
                                        : undefined,
                                    color:
                                      check.score >= 0 ? '#ffffff' : undefined,
                                  }}
                                />
                              </Box>
                              <Typography
                                variant="body2"
                                color="textSecondary"
                                gutterBottom
                              >
                                {check.reason}
                              </Typography>
                              {check.details && check.details.length > 0 && (
                                <Box mt={1} position="relative">
                                  <Box
                                    style={{
                                      maxHeight: isExpanded ? 'none' : '200px',
                                      overflow: isExpanded
                                        ? 'visible'
                                        : 'hidden',
                                      maskImage:
                                        hasManyDetails && !isExpanded
                                          ? `linear-gradient(to bottom, black 70%, transparent 100%)`
                                          : 'none',
                                      WebkitMaskImage:
                                        hasManyDetails && !isExpanded
                                          ? `linear-gradient(to bottom, black 70%, transparent 100%)`
                                          : 'none',
                                    }}
                                  >
                                    {visibleDetails.map((detail, idx) => (
                                      <Typography
                                        key={idx}
                                        variant="caption"
                                        color="textSecondary"
                                        display="block"
                                      >
                                        • {detail}
                                      </Typography>
                                    ))}
                                  </Box>
                                  {hasManyDetails && (
                                    <>
                                      <Collapse in={isExpanded} timeout="auto">
                                        <Box>
                                          {check
                                            .details!.slice(MAX_VISIBLE_DETAILS)
                                            .map((detail, idx) => (
                                              <Typography
                                                key={MAX_VISIBLE_DETAILS + idx}
                                                variant="caption"
                                                color="textSecondary"
                                                display="block"
                                              >
                                                • {detail}
                                              </Typography>
                                            ))}
                                        </Box>
                                      </Collapse>
                                      <Button
                                        size="small"
                                        onClick={toggleExpand}
                                        startIcon={
                                          isExpanded ? (
                                            <ExpandLessIcon />
                                          ) : (
                                            <ExpandMoreIcon />
                                          )
                                        }
                                        style={{
                                          marginTop: '8px',
                                          textTransform: 'none',
                                        }}
                                      >
                                        {isExpanded
                                          ? 'Show less'
                                          : `Show ${hiddenCount} more`}
                                      </Button>
                                    </>
                                  )}
                                </Box>
                              )}
                              <Box mt={1}>
                                <Link
                                  href={check.documentation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  variant="caption"
                                >
                                  Learn more →
                                </Link>
                              </Box>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </>
                )}

                {/* Passed Checks */}
                {passedChecks.length > 0 && (
                  <>
                    <Typography
                      variant="h6"
                      style={{
                        marginTop: '24px',
                        marginBottom: '8px',
                        fontWeight: 'bold',
                      }}
                    >
                      All Checks Passed
                    </Typography>
                    <Grid container spacing={2}>
                      {passedChecks.map(check => {
                        const isExpanded = expandedChecks.has(check.name);
                        const hasManyDetails =
                          check.details &&
                          check.details.length > MAX_VISIBLE_DETAILS;
                        const visibleDetails =
                          hasManyDetails && !isExpanded
                            ? check.details!.slice(0, MAX_VISIBLE_DETAILS)
                            : check.details || [];
                        const hiddenCount =
                          hasManyDetails && !isExpanded
                            ? check.details!.length - MAX_VISIBLE_DETAILS
                            : 0;

                        const toggleExpand = () => {
                          const newExpanded = new Set(expandedChecks);
                          if (isExpanded) {
                            newExpanded.delete(check.name);
                          } else {
                            newExpanded.add(check.name);
                          }
                          setExpandedChecks(newExpanded);
                        };

                        return (
                          <Grid item xs={12} md={6} key={check.name}>
                            <Box
                              border={1}
                              borderColor="divider"
                              borderRadius={1}
                              p={2}
                              height="100%"
                              display="flex"
                              flexDirection="column"
                            >
                              <Box
                                display="flex"
                                justifyContent="space-between"
                                alignItems="center"
                                mb={1}
                              >
                                <Typography
                                  variant="subtitle1"
                                  style={{ fontWeight: 'bold' }}
                                >
                                  {check.name}
                                </Typography>
                                <Chip
                                  label={
                                    <Box
                                      display="flex"
                                      alignItems="center"
                                      style={{ gap: '8px' }}
                                    >
                                      <span>
                                        {check.score >= 0
                                          ? `${check.score} / 10`
                                          : 'N/A'}
                                      </span>
                                      {check.score === 10 && (
                                        <CheckIcon
                                          style={{
                                            fontSize: '16px',
                                            marginLeft: '4px',
                                          }}
                                        />
                                      )}
                                    </Box>
                                  }
                                  size="small"
                                  style={{
                                    backgroundColor:
                                      check.score >= 0
                                        ? getCheckScoreColor(check.score)
                                        : undefined,
                                    color:
                                      check.score >= 0 ? '#ffffff' : undefined,
                                  }}
                                />
                              </Box>
                              <Typography
                                variant="body2"
                                color="textSecondary"
                                gutterBottom
                              >
                                {check.reason}
                              </Typography>
                              {check.details && check.details.length > 0 && (
                                <Box mt={1} position="relative">
                                  <Box
                                    style={{
                                      maxHeight: isExpanded ? 'none' : '200px',
                                      overflow: isExpanded
                                        ? 'visible'
                                        : 'hidden',
                                      maskImage:
                                        hasManyDetails && !isExpanded
                                          ? `linear-gradient(to bottom, black 70%, transparent 100%)`
                                          : 'none',
                                      WebkitMaskImage:
                                        hasManyDetails && !isExpanded
                                          ? `linear-gradient(to bottom, black 70%, transparent 100%)`
                                          : 'none',
                                    }}
                                  >
                                    {visibleDetails.map((detail, idx) => (
                                      <Typography
                                        key={idx}
                                        variant="caption"
                                        color="textSecondary"
                                        display="block"
                                      >
                                        • {detail}
                                      </Typography>
                                    ))}
                                  </Box>
                                  {hasManyDetails && (
                                    <>
                                      <Collapse in={isExpanded} timeout="auto">
                                        <Box>
                                          {check
                                            .details!.slice(MAX_VISIBLE_DETAILS)
                                            .map((detail, idx) => (
                                              <Typography
                                                key={MAX_VISIBLE_DETAILS + idx}
                                                variant="caption"
                                                color="textSecondary"
                                                display="block"
                                              >
                                                • {detail}
                                              </Typography>
                                            ))}
                                        </Box>
                                      </Collapse>
                                      <Button
                                        size="small"
                                        onClick={toggleExpand}
                                        startIcon={
                                          isExpanded ? (
                                            <ExpandLessIcon />
                                          ) : (
                                            <ExpandMoreIcon />
                                          )
                                        }
                                        style={{
                                          marginTop: '8px',
                                          textTransform: 'none',
                                        }}
                                      >
                                        {isExpanded
                                          ? 'Show less'
                                          : `Show ${hiddenCount} more`}
                                      </Button>
                                    </>
                                  )}
                                </Box>
                              )}
                              <Box mt={1}>
                                <Link
                                  href={check.documentation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  variant="caption"
                                >
                                  Learn more →
                                </Link>
                              </Box>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                  </>
                )}
              </>
            );
          })()}
        </Grid>
      </Grid>
    </Content>
  );
};

export const EntityOSSFScorecardContent = () => {
  return (
    <QueryClientProvider>
      <ScorecardContent />
    </QueryClientProvider>
  );
};
