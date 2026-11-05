import { Cell, CellText, Flex, Link, Text } from '@backstage/ui';
import { NewTabHint } from '../ExternalLink/NewTabHint';

export type ExternalCellTextProps = {
  /** The cell's text, and the link's. Truncated, the whole on hover. */
  title: string;
  /**
   * Where the link leads, outside the app. Without one the cell is bui's
   * plain `CellText`.
   */
  href?: string;
  /** A secondary line under the title, as `CellText`'s. */
  description?: string;
};

const titleStyle = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/**
 * bui's `CellText` for a link leaving the app: it opens in a new tab, and says
 * so as `ExternalLink` does, with the launch icon and "(opens in a new tab)"
 * for a screen reader. bui's `CellText` takes an `href` but no `target`, so
 * its link always opens in the same tab.
 */
export const ExternalCellText = ({
  title,
  href,
  description,
}: ExternalCellTextProps) => {
  if (!href) {
    return <CellText title={title} description={description} />;
  }
  return (
    <Cell>
      <Flex direction="column" gap="0" style={{ minWidth: 0 }}>
        {/* A flex link, so the title truncates and the icon stays. */}
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="body-medium"
          title={title}
          style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
        >
          <span style={titleStyle}>{title}</span>
          <NewTabHint />
        </Link>
        {description && (
          <Text color="secondary" truncate title={description}>
            {description}
          </Text>
        )}
      </Flex>
    </Cell>
  );
};
