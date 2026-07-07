import { Box, makeStyles, Theme } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { MarkdownContent, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../apis';
import { isHtmlFile } from '../lib/files';

const useStyles = makeStyles((theme: Theme) => ({
  markdown: {
    '& img': {
      maxWidth: '100%',
    },
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

  return (
    <Box className={classes.markdown}>
      <MarkdownContent content={data.content} dialect="gfm" />
    </Box>
  );
}
