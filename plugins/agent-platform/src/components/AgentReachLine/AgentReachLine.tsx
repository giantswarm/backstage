import { Flex, Text } from '@backstage/ui';
import LinkIcon from '@material-ui/icons/Link';
import {
  parseSelector,
  selectorLabel,
  toolsetShape,
  type DeclaredToolset,
} from '../../lib/toolset';

/** `A`, `A and B`, `A, B and C`. */
function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names.join('');
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** A selector as a reader names it: a labelled preset by its label, anything else by its name. */
function reachName(selector: string): string {
  const label = selectorLabel(selector);
  if (label !== selector) {
    return label;
  }
  return parseSelector(selector)?.name ?? selector;
}

/**
 * What an agent's declared toolset lets it reach, as one sentence, or
 * `undefined` when the toolset is not known.
 */
export function describeReach(
  toolset: DeclaredToolset | undefined,
): string | undefined {
  if (!toolset || toolset.state === 'unresolved') {
    return undefined;
  }
  if (toolset.state === 'no-gateway') {
    return 'Has no connectors';
  }
  if (toolset.state === 'implicit-full') {
    return 'Can use every connector you can';
  }
  switch (toolsetShape(toolset.selectors)) {
    case 'none':
      return 'Has no connectors';
    case 'full':
      return 'Can use every connector you can';
    default:
      return `Can use ${joinNames(toolset.selectors.map(reachName))}`;
  }
}

export type AgentReachLineProps = {
  toolset?: DeclaredToolset;
};

/** One line under the composer on what the chosen agent can reach. */
export function AgentReachLine({ toolset }: AgentReachLineProps) {
  const reach = describeReach(toolset);
  if (!reach) {
    return null;
  }
  return (
    <Flex justify="center" align="center" gap="1">
      <LinkIcon fontSize="small" color="disabled" aria-hidden />
      <Text variant="body-small" color="secondary">
        {reach}
      </Text>
    </Flex>
  );
}
