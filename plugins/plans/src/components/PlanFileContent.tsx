import { Box, makeStyles, Theme } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { MarkdownContent, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../apis';
import { isHtmlFile, splitFrontmatter } from '../lib/files';

const useStyles = makeStyles((theme: Theme) => ({
  markdown: {
    '& img': {
      maxWidth: '100%',
    },
  },
  frontmatter: {
    fontFamily: 'monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.action.hover,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1, 1.5),
    marginBottom: theme.spacing(2),
  },
  htmlFrame: {
    width: '100%',
    height: '75vh',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: '#fff',
  },
}));

/**
 * Fetches one file from a plan repository at a ref and renders it: markdown
 * via MarkdownContent (GFM), `*.html` (plan explainers) in a sandboxed
 * iframe via srcdoc. Scripts may run inside the sandbox, but without
 * `allow-same-origin` the document has no access to the portal's origin,
 * cookies, or storage.
 */
export function PlanFileContent(props: {
  repo: string;
  refName: string;
  path: string;
}) {
  const { repo, refName, path } = props;
  const classes = useStyles();
  const plansApi = useApi(plansApiRef);

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'content', repo, refName, path],
    queryFn: () => plansApi.getContent(path, refName, repo),
  });

  if (isLoading) {
    return <Progress />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }
  if (!data) {
    return null;
  }

  if (isHtmlFile(path)) {
    return (
      <iframe
        className={classes.htmlFrame}
        title={path}
        sandbox="allow-scripts"
        srcDoc={data.content}
      />
    );
  }

  const { frontmatter, body } = splitFrontmatter(data.content);

  return (
    <Box className={classes.markdown}>
      {frontmatter && <Box className={classes.frontmatter}>{frontmatter}</Box>}
      <MarkdownContent content={body} dialect="gfm" />
    </Box>
  );
}
