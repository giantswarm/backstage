import { Flex } from '@backstage/ui';
import { GSMarkdownContent } from '../GSMarkdownContent';
import {
  CollapsibleToggle,
  CollapsibleViewport,
  useCollapsible,
} from '../Collapsible';

const DEFAULT_COLLAPSED_HEIGHT = 250;

export type CollapsibleMarkdownProps = {
  content: string;
  /** URL the markdown was loaded from; relative links resolve against it. */
  sourceUrl?: string;
  toggleLabels: { expand: string; collapse: string };
  /** Height in pixels the content is cut to while collapsed. */
  collapsedHeight?: number;
};

/**
 * Markdown cut to a fixed height with a fade, and a toggle to show all of it.
 * Content that fits is shown whole, without a toggle.
 */
export const CollapsibleMarkdown = ({
  content,
  sourceUrl,
  toggleLabels,
  collapsedHeight = DEFAULT_COLLAPSED_HEIGHT,
}: CollapsibleMarkdownProps) => {
  const collapsible = useCollapsible({ collapsedHeight });

  return (
    <Flex direction="column" gap="2">
      <CollapsibleViewport state={collapsible}>
        <GSMarkdownContent content={content} sourceUrl={sourceUrl} />
      </CollapsibleViewport>
      {collapsible.overflows && (
        <Flex justify="center">
          <CollapsibleToggle state={collapsible} labels={toggleLabels} />
        </Flex>
      )}
    </Flex>
  );
};
