import { Box, Divider, Typography, makeStyles, Theme } from '@material-ui/core';
import { Skeleton } from '@material-ui/lab';

const useStyles = makeStyles((theme: Theme) => ({
  row: {
    marginBottom: theme.spacing(1),
  },
  empty: {
    padding: theme.spacing(4),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
}));

/** Placeholder rows for the browse/search list while tools load. */
export function BrowserSkeleton({ rows = 6 }: { rows?: number }) {
  const classes = useStyles();
  return (
    <Box>
      {Array.from({ length: rows }).map((_, i) => (
        <Box key={i} className={classes.row}>
          <Skeleton variant="text" width="60%" height={20} />
          <Skeleton variant="text" width="85%" height={16} />
        </Box>
      ))}
    </Box>
  );
}

/** Placeholder for the tool detail panel while `describe_tool` loads. */
export function DetailSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width="40%" height={32} />
      <Skeleton variant="text" width="90%" height={18} />
      <Box mt={2}>
        <Skeleton variant="text" width="25%" height={20} />
        <Skeleton variant="rect" width="100%" height={44} />
        <Box mt={2} />
        <Skeleton variant="rect" width="100%" height={44} />
      </Box>
      <Box mt={2}>
        <Skeleton variant="rect" width={120} height={36} />
      </Box>
    </Box>
  );
}

/** A friendly, centred zero-result / empty message. */
export function ExplorerEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const classes = useStyles();
  return (
    <Box className={classes.empty}>
      <Typography variant="body1">{title}</Typography>
      {description && (
        <>
          <Box mt={1}>
            <Divider />
          </Box>
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ marginTop: 8 }}
          >
            {description}
          </Typography>
        </>
      )}
    </Box>
  );
}
