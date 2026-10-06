import { useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Flex,
  Grid,
  Link,
  List,
  ListRow,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  DataBar,
  SectionHeader,
  StatusLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { useHiveDetailLinks } from '../../hooks/useHiveDetail';
import { relativeTime } from '../../lib/dates';
import { FrontItem, FrontSection } from '../../lib/frontPage';
import { linkTarget } from '../../lib/hive';

/** Rows beside a section's lead before "Show all". */
const ROWS_PREVIEW = 4;

const useStyles = makeStyles({
  // Overlapping avatars, the first on top, like the catalog's owner stacks.
  people: {
    display: 'flex',
    '& > *': {
      boxShadow: '0 0 0 2px var(--bui-bg-neutral-1)',
      borderRadius: '50%',
    },
    '& > * + *': {
      marginLeft: 'calc(-1 * var(--bui-space-1_5, 6px))',
    },
  },
  // The lead fills its grid cell, so it lines up with the list beside it.
  lead: {
    height: '100%',
  },
  wrap: {
    flexWrap: 'wrap',
  },
  // A section's anchor clears the page header when a link jumps to it.
  section: {
    scrollMarginTop: 'var(--bui-space-6)',
  },
});

function People(props: { names: string[] }) {
  const classes = useStyles();
  if (props.names.length === 0) {
    return null;
  }
  return (
    <div className={classes.people} title={props.names.join(', ')}>
      {props.names.slice(0, 4).map(name => (
        // No photo in the magazine data; bui falls back to the initials.
        <Avatar key={name} src="" name={name} size="small" />
      ))}
    </div>
  );
}

/** A board status as a coloured label, anything else as a badge. */
export function ItemStatus(props: { status: FrontItem['status'] }) {
  const { status } = props;
  if (!status?.label) {
    return null;
  }
  return status.intent ? (
    <StatusLabel label={status.label} intent={status.intent} />
  ) : (
    <Badge size="small">{status.label}</Badge>
  );
}

function Customers(props: { names: string[] }) {
  if (props.names.length === 0) {
    return null;
  }
  return (
    <TagGroup aria-label="Customers">
      {props.names.map(name => (
        <Tag key={name} id={name} size="small">
          {name}
        </Tag>
      ))}
    </TagGroup>
  );
}

/** The section's lead: the whole card opens the item. */
function LeadCard(props: { item: FrontItem }) {
  const { item } = props;
  const classes = useStyles();
  const { itemHref, docHref } = useHiveDetailLinks();
  const href = itemHref(item.target);
  const moved = relativeTime(item.at);

  return (
    <Card
      href={href}
      label={item.title}
      {...linkTarget(href)}
      className={classes.lead}
    >
      <CardHeader>
        <Flex justify="between" align="center" gap="3">
          <ItemStatus status={item.status} />
          {moved && (
            <Text variant="body-small" color="secondary">
              {moved}
            </Text>
          )}
        </Flex>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="3">
          <Text as="h3" variant="title-small" weight="bold">
            {item.title}
          </Text>
          {item.teaser && (
            <Text as="p" variant="body-medium" color="secondary">
              {item.teaser}
            </Text>
          )}
          {item.progress && (
            <DataBar
              label={item.progress.label}
              value={item.progress.percent}
              max={100}
              color="var(--bui-fg-announcement)"
            />
          )}
          {(item.customers.length > 0 || item.people.length > 0) && (
            <Flex justify="between" align="center" gap="3">
              <Customers names={item.customers} />
              <People names={item.people} />
            </Flex>
          )}
        </Flex>
      </CardBody>
      {(item.tryIt || item.background.length > 0) && (
        <CardFooter>
          <Flex align="center" gap="3" className={classes.wrap}>
            {item.tryIt && (
              <ButtonLink
                href={item.tryIt.url}
                variant="secondary"
                size="small"
              >
                {item.tryIt.label}
              </ButtonLink>
            )}
            {item.background.map(doc => (
              <Link
                key={doc.path}
                href={docHref(doc.path)}
                variant="body-small"
              >
                {doc.label}
              </Link>
            ))}
          </Flex>
        </CardFooter>
      )}
    </Card>
  );
}

/** The rest of a section: one line each, the row opens the item. */
function ItemRows(props: { label: string; items: FrontItem[] }) {
  const { itemHref } = useHiveDetailLinks();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? props.items : props.items.slice(0, ROWS_PREVIEW);

  return (
    <Flex direction="column" gap="2">
      <List aria-label={props.label}>
        {shown.map(item => {
          const href = itemHref(item.target);
          return (
            <ListRow
              key={item.key}
              id={item.key}
              textValue={item.title}
              href={href}
              {...linkTarget(href)}
              description={[relativeTime(item.at), ...item.customers]
                .filter(Boolean)
                .join(' · ')}
              customActions={<ItemStatus status={item.status} />}
            >
              {item.title}
            </ListRow>
          );
        })}
      </List>
      {props.items.length > ROWS_PREVIEW && (
        <Button
          variant="tertiary"
          size="small"
          onPress={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show fewer' : `Show all ${props.items.length}`}
        </Button>
      )}
    </Flex>
  );
}

/** Blocked work, at the top of its section: what blocks it, since when. */
function Blocked(props: { items: FrontItem[] }) {
  const { itemHref } = useHiveDetailLinks();
  if (props.items.length === 0) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      {props.items.map(item => (
        <Alert
          key={item.key}
          status="warning"
          icon
          title={
            <Link href={itemHref(item.target)}>{`Blocked: ${item.title}`}</Link>
          }
          description={item.blocker}
        />
      ))}
    </Flex>
  );
}

/**
 * One of the front page's fixed sections: its blockers, its lead item as a
 * card spanning two columns, the rest as one-line rows beside it. An empty
 * section is one muted line, so the page keeps its shape at every moment.
 */
export function FrontSectionView(props: { section: FrontSection }) {
  const { section } = props;
  const classes = useStyles();
  const [lead, ...rest] = section.items;
  const headingId = `hive-section-${section.id}`;

  return (
    <section
      id={section.id}
      aria-labelledby={headingId}
      className={classes.section}
    >
      <Flex direction="column" gap="3">
        <SectionHeader
          id={headingId}
          as="h2"
          variant="title-medium"
          title={section.title}
          description={section.description}
        />
        <Blocked items={section.blocked} />
        {lead ? (
          <Grid.Root columns={{ initial: '1', md: '3' }} gap="4">
            <Grid.Item colSpan={{ initial: '1', md: rest.length ? '2' : '3' }}>
              <LeadCard item={lead} />
            </Grid.Item>
            {rest.length > 0 && (
              <Grid.Item colSpan="1">
                <ItemRows label={section.title} items={rest} />
              </Grid.Item>
            )}
          </Grid.Root>
        ) : (
          <Text as="p" variant="body-medium" color="secondary">
            {section.empty}
          </Text>
        )}
        {section.footnote && (
          <Text variant="body-small" color="secondary">
            {section.footnote}
          </Text>
        )}
      </Flex>
    </section>
  );
}
