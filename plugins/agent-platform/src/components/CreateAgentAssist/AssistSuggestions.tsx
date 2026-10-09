import { Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { FencedBlock } from '../../lib/fencedBlocks';

const useStyles = makeStyles(theme => ({
  card: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 'var(--bui-radius-3)',
    padding: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  // The proposal as written, bounded: a long draft scrolls inside its card
  // rather than pushing the composer away.
  code: {
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxHeight: 180,
    overflowY: 'auto',
    backgroundColor: 'var(--bui-bg-neutral-1)',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 'var(--bui-radius-2)',
    padding: theme.spacing(1.5),
  },
  actions: {
    alignSelf: 'flex-start',
  },
}));

export type AssistSuggestionsProps = {
  /** Fenced blocks of the reply the suggestions come from, in reply order. */
  blocks: FencedBlock[];
  /** Which block was taken into the form, when one was. */
  appliedIndex?: number;
  /** Take a block's content into the form's system prompt. */
  onUse: (index: number, code: string) => void;
  /** Put the system prompt back to what it was before {@link onUse}. */
  onUndo: () => void;
};

/**
 * The accept-into-form affordance of the create-agent assist: one card per
 * fenced code block of the agent's newest reply, each with a "Use as system
 * prompt" button that copies the block into the form's System prompt field.
 *
 * This is the whole accept mechanism, deliberately: kagent replies are plain
 * markdown, with no structured suggestion protocol for skills, tools or other
 * fields to ride on, so a fenced block into the one free-text field is what a
 * chat reply supports today (the artboard's richer accept-to-apply — skills
 * added to the selection, per-field patches — needs structure the backend
 * does not have).
 */
export function AssistSuggestions({
  blocks,
  appliedIndex,
  onUse,
  onUndo,
}: AssistSuggestionsProps) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="2">
      <Text variant="body-small" weight="bold">
        From the reply
      </Text>
      {blocks.map((block, index) => (
        // Position is the identity a reply's blocks have; replies are not
        // reordered, only replaced wholesale by a newer reply.
        // eslint-disable-next-line react/no-array-index-key
        <div key={index} className={classes.card}>
          <pre className={classes.code}>{block.code}</pre>
          {appliedIndex === index ? (
            <Flex align="center" gap="2">
              <Text variant="body-small" color="secondary" role="status">
                Added to the system prompt.
              </Text>
              <Button size="small" variant="tertiary" onPress={onUndo}>
                Undo
              </Button>
            </Flex>
          ) : (
            <div className={classes.actions}>
              <Button
                size="small"
                variant="secondary"
                onPress={() => onUse(index, block.code)}
              >
                Use as system prompt
              </Button>
            </div>
          )}
        </div>
      ))}
    </Flex>
  );
}
