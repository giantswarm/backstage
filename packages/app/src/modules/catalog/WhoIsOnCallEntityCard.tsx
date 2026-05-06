import { useEffect, useState } from 'react';
import { UserEntity } from '@backstage/catalog-model';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import {
  catalogApiRef,
  EntityInfoCard,
  useEntity,
  useEntityRefLink,
} from '@backstage/plugin-catalog-react';
import { useApi } from '@backstage/core-plugin-api';
import { Progress, ResponseErrorPanel } from '@backstage/core-components';
import {
  isPagerDutyAvailable,
  pagerDutyApiRef,
} from '@pagerduty/backstage-plugin';
import { Avatar, Box, Card, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { RiExternalLinkLine } from '@remixicon/react';

const PAGERDUTY_USER_ID_ANNOTATION = 'pagerduty.com/user-id';

type OnCallUser = {
  id: string;
  name: string;
  email: string;
  html_url: string;
  avatar_url: string;
};

const useStyles = makeStyles({
  list: {
    display: 'grid',
    gap: 'var(--bui-space-3)',
    gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))',
    gridAutoRows: '1fr',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  listItem: {
    display: 'contents',
  },
  card: {
    display: 'flex',
    gap: 'var(--bui-space-3)',
    padding: 'var(--bui-space-3)',
    alignItems: 'flex-start',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  avatar: {
    flexShrink: 0,
  },
  cardTextContainer: {
    overflow: 'hidden',
  },
  externalLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
  },
});

function OnCallUserTile({
  user,
  catalogUser,
  policyName,
  policyUrl,
}: {
  user: OnCallUser;
  catalogUser?: UserEntity;
  policyName?: string;
  policyUrl?: string;
}) {
  const classes = useStyles();
  const entityLink = useEntityRefLink();

  const profile = catalogUser?.spec?.profile;
  const displayName =
    profile?.displayName ?? catalogUser?.metadata.name ?? user.name;
  const picture = profile?.picture ?? user.avatar_url;

  const content = (
    <>
      <Avatar
        className={classes.avatar}
        name={displayName}
        src={picture ?? ''}
        purpose="decoration"
        size="x-large"
      />
      <Flex className={classes.cardTextContainer} direction="column" gap="1">
        <Text variant="body-large" as="h4">
          {displayName}
        </Text>
        {policyUrl && policyName && (
          <Link
            className={classes.externalLink}
            href={policyUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open escalation policy in PagerDuty"
          >
            {policyName}
            <RiExternalLinkLine size={14} />
          </Link>
        )}
      </Flex>
    </>
  );

  if (catalogUser) {
    return (
      <Card
        className={classes.card}
        href={entityLink(catalogUser)}
        label={displayName}
      >
        {content}
      </Card>
    );
  }

  return <Card className={classes.card}>{content}</Card>;
}

function WhoIsOnCallContent() {
  const classes = useStyles();
  const { entity } = useEntity();
  const api = useApi(pagerDutyApiRef);
  const catalogApi = useApi(catalogApiRef);

  const [users, setUsers] = useState<OnCallUser[]>();
  const [catalogByPdId, setCatalogByPdId] = useState<Map<string, UserEntity>>(
    new Map(),
  );
  const [serviceUrl, setServiceUrl] = useState<string>();
  const [policyName, setPolicyName] = useState<string>();
  const [policyUrl, setPolicyUrl] = useState<string>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    (async () => {
      try {
        const { service } = await api.getServiceByEntity(entity);
        const onCall = await api.getOnCallByPolicyId(
          service.escalation_policy.id,
        );

        const ids = onCall.map(u => u.id).filter(Boolean);
        const map = new Map<string, UserEntity>();
        if (ids.length > 0) {
          const { items } = await catalogApi.getEntities({
            filter: {
              kind: 'User',
              [`metadata.annotations.${PAGERDUTY_USER_ID_ANNOTATION}`]: ids,
            },
          });
          for (const item of items as UserEntity[]) {
            const id =
              item.metadata.annotations?.[PAGERDUTY_USER_ID_ANNOTATION];
            if (id) map.set(id, item);
          }
        }

        if (!cancelled) {
          setServiceUrl(service.html_url);
          setPolicyName(service.escalation_policy.name);
          setPolicyUrl(service.escalation_policy.html_url);
          setUsers(onCall);
          setCatalogByPdId(map);
        }
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, catalogApi, entity]);

  const headerActions = serviceUrl ? (
    <Link
      href={serviceUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open service in PagerDuty"
    >
      View in PagerDuty
    </Link>
  ) : undefined;

  let body;
  if (loading) {
    body = <Progress />;
  } else if (error) {
    body = <ResponseErrorPanel error={error} />;
  } else if (!users?.length) {
    body = <Text>Nobody is currently on call.</Text>;
  } else {
    body = (
      <Box as="ul" className={classes.list}>
        {users.map(user => (
          <Box key={user.id} as="li" className={classes.listItem}>
            <OnCallUserTile
              user={user}
              catalogUser={catalogByPdId.get(user.id)}
              policyName={policyName}
              policyUrl={policyUrl}
            />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <EntityInfoCard title="On call" headerActions={headerActions}>
      {body}
    </EntityInfoCard>
  );
}

export const WhoIsOnCallEntityCard = EntityCardBlueprint.make({
  name: 'who-is-on-call',
  params: {
    type: 'info',
    filter: entity => isPagerDutyAvailable(entity),
    loader: async () => <WhoIsOnCallContent />,
  },
});
