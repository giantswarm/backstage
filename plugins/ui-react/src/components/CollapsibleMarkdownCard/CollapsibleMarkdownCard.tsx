import { ReactNode } from 'react';
import { Progress } from '@backstage/core-components';
import { Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import DescriptionIcon from '@material-ui/icons/Description';
import { CollapsibleMarkdown } from '../CollapsibleMarkdown';
import { InfoCard } from '../InfoCard';

const useStyles = makeStyles({
  // A span, not a Flex: the title renders inside the card's heading.
  title: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
  },
});

export type CollapsibleMarkdownCardProps = {
  title: string;
  content: string | undefined | null;
  isLoading: boolean;
  error?: Error | null;
  emptyMessage: string;
  toggleLabels: { expand: string; collapse: string };
  // Optional override for specific error types (e.g. NotFoundError → friendly message).
  // Return undefined to fall through to the default error rendering.
  renderError?: (error: Error) => ReactNode | undefined;
};

/**
 * A card showing a loaded markdown document (a README, a SOUL.md) through
 * `CollapsibleMarkdown`, with loading, error and empty states.
 */
export const CollapsibleMarkdownCard = ({
  title,
  content,
  isLoading,
  error,
  emptyMessage,
  toggleLabels,
  renderError,
}: CollapsibleMarkdownCardProps) => {
  const classes = useStyles();

  const renderBody = () => {
    if (isLoading) {
      return <Progress />;
    }

    if (error) {
      const customRendered = renderError?.(error);
      if (customRendered !== undefined) {
        return customRendered;
      }
      return <Text color="danger">{error.message}</Text>;
    }

    if (!content) {
      return <Text color="secondary">{emptyMessage}</Text>;
    }

    return (
      <CollapsibleMarkdown content={content} toggleLabels={toggleLabels} />
    );
  };

  return (
    <InfoCard
      title={
        <span className={classes.title}>
          <DescriptionIcon fontSize="inherit" />
          {title}
        </span>
      }
    >
      {renderBody()}
    </InfoCard>
  );
};
