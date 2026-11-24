import { makeStyles } from '@material-ui/core';
import { splitByQuery } from '../PlatformClusterRBAC/search';

const useStyles = makeStyles({
  match: {
    backgroundColor: 'var(--bui-warning-bg-subdued)',
    color: 'inherit',
    borderRadius: 2,
  },
});

/** Text with each occurrence of a search query marked. */
export function PlatformMarkedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const classes = useStyles();
  return (
    <>
      {splitByQuery(text, query).map((part, index) =>
        part.isMatch ? (
          <mark key={index} className={classes.match}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
