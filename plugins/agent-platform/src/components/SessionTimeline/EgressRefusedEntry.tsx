import type { ReactNode } from 'react';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { SimpleAccordion } from '@giantswarm/backstage-plugin-ui-react';

import { egressOriginFor, EgressRefusedItem } from '../../lib/egressRefusals';
import { EGRESS_ALERT_COPY } from '../../lib/egressCopy';
import type { EgressRemedy } from '../../lib/egressRemedy';

const useStyles = makeStyles({
  // A host or origin is one long word: it wraps anywhere at phone width
  // rather than push the timeline sideways (inherited by the whole alert).
  entry: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  value: {
    fontFamily: 'var(--bui-font-monospace)',
    overflowWrap: 'anywhere',
  },
});

export type EgressSettingsLink = {
  /** The agent's name as the page shows it. */
  agentName?: string;
  /**
   * What the person can do about a refusal, for this agent; absent offers
   * the neutral remedy, which promises nothing.
   */
  remedy?: EgressRemedy;
};

function destinationOf(item: EgressRefusedItem): string {
  if (!item.host) {
    return EGRESS_ALERT_COPY.details.unnamedHost;
  }
  return item.port ? `${item.host}:${item.port}` : item.host;
}

function timeOf(at: string | undefined): string | undefined {
  if (!at) {
    return undefined;
  }
  return new Date(at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A sentence, then its links in one line after it. */
function Remedy({
  text,
  links = [],
}: {
  text: string;
  links?: { href?: string; label: string }[];
}) {
  const shown = links.filter((link): link is { href: string; label: string } =>
    Boolean(link.href),
  );
  return (
    <Text variant="body-small">
      {text}
      {shown.map((link, index) => (
        <span key={link.href}>
          {index === 0 ? ' ' : ' · '}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </Text>
  );
}

/**
 * The remedy that applies to the agent (`egressRemedyKind`), in plain words
 * (`EGRESS_ALERT_COPY`). Nothing while the agent is being read: no remedy
 * rather than a wrong one.
 */
function remedyOf(
  item: EgressRefusedItem,
  { agent, subject }: { agent: string; subject: string },
  remedy: EgressRemedy,
): ReactNode {
  const { remedy: says, links } = EGRESS_ALERT_COPY;
  const origin = egressOriginFor(item);
  const host = item.host ?? EGRESS_ALERT_COPY.addressStandIn;
  switch (remedy.kind) {
    case 'pending':
      return null;
    case 'toolchains':
      // A toolchain declares http(s) origins: a raw TCP or folded
      // destination is the platform team's alone.
      return origin ? (
        <Remedy
          text={says.toolchains(subject, remedy.runtime, host)}
          links={[
            { href: remedy.toolchainsHref, label: links.toolchains },
            { href: remedy.newSessionHref, label: links.newSession },
          ]}
        />
      ) : (
        <Remedy text={says.platform(subject, remedy.runtime, host)} />
      );
    case 'platform':
      return <Remedy text={says.platform(subject, remedy.runtime, host)} />;
    case 'git':
      return <Remedy text={says.git(subject)} />;
    case 'ask-editor':
      return (
        <Remedy
          text={says.askEditor(agent, host)}
          links={[{ href: remedy.agentHref, label: links.agentPage(subject) }]}
        />
      );
    case 'edit': {
      let text = says.editUnnamed(agent);
      if (origin) {
        text = says.edit(agent, origin);
      } else if (item.scheme === 'tcp') {
        text = says.editTcp(subject);
      }
      return (
        <Remedy
          text={text}
          links={[{ href: remedy.editHref, label: links.edit(agent) }]}
        />
      );
    }
    default:
      return <Remedy text={says.neutral(agent, host)} />;
  }
}

/**
 * Connections of this turn the agent's egress policy refused, to one
 * destination: which host, when, how often, and what the person can do about
 * it for this agent. A warning, not an error: the turn went on, and what the
 * agent made of the refusal is in its answer under it. The port, scheme and
 * origin are technical details, folded.
 */
export function EgressRefusedEntry({
  item,
  egressSettings,
}: {
  item: EgressRefusedItem;
  egressSettings?: EgressSettingsLink;
}) {
  const classes = useStyles();
  // The agent's name as it is, or the stand-in, capitalized to open a sentence.
  const name = egressSettings?.agentName;
  const names = {
    agent: name ?? EGRESS_ALERT_COPY.agentStandIn,
    subject: name ?? EGRESS_ALERT_COPY.subjectStandIn,
  };
  const origin = egressOriginFor(item);
  const reason =
    item.scheme === 'tcp'
      ? EGRESS_ALERT_COPY.tcpReason
      : EGRESS_ALERT_COPY.reason(names.subject);
  const facts = [
    reason,
    timeOf(item.at),
    EGRESS_ALERT_COPY.attempts(item.count),
  ]
    .filter(Boolean)
    .join(' · ');
  const remedy = remedyOf(
    item,
    names,
    egressSettings?.remedy ?? { kind: 'neutral' },
  );

  return (
    <div
      className={classes.entry}
      data-testid="timeline-egress-refused"
      data-host={item.host}
      data-port={item.port}
    >
      <Alert
        status="warning"
        icon
        title={EGRESS_ALERT_COPY.title(item.host)}
        description={
          <Flex direction="column" gap="1">
            <Text variant="body-small">{facts}</Text>
            {remedy}
            <SimpleAccordion
              title={EGRESS_ALERT_COPY.details.title}
              headingLevel={4}
            >
              <Flex direction="column" gap="1">
                <Text variant="body-small">
                  {EGRESS_ALERT_COPY.details.destination}{' '}
                  <span className={classes.value}>{destinationOf(item)}</span>
                  {` (${item.scheme})`}
                </Text>
                {origin && (
                  <Text variant="body-small">
                    {EGRESS_ALERT_COPY.details.origin}{' '}
                    <span className={classes.value}>{origin}</span>
                  </Text>
                )}
              </Flex>
            </SimpleAccordion>
          </Flex>
        }
      />
    </div>
  );
}
