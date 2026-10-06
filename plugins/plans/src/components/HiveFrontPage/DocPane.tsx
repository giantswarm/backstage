import { ButtonLink, Flex } from '@backstage/ui';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { DetailsDrawer } from '@giantswarm/backstage-plugin-ui-react';
import { useHiveDetail } from '../../hooks/useHiveDetail';
import { hiveKnowledgeRouteRef } from '../../routes';
import { KnowledgeDocument } from '../HiveKnowledgeTab';

/**
 * A knowledge document opened in place (`?doc=<path>`), from an item's
 * background links: read it beside the page, or open it in the knowledge
 * reader with the other documents.
 */
export function DocPane() {
  const { doc, close } = useHiveDetail();
  const knowledge = useRouteRef(hiveKnowledgeRouteRef);
  return (
    <DetailsDrawer open={Boolean(doc)} onClose={close}>
      {doc && (
        <Flex direction="column" gap="4">
          {knowledge && (
            <Flex>
              <ButtonLink
                href={`${knowledge()}?doc=${encodeURIComponent(doc)}`}
                variant="secondary"
                size="small"
              >
                Open in Knowledge
              </ButtonLink>
            </Flex>
          )}
          <KnowledgeDocument path={doc} />
        </Flex>
      )}
    </DetailsDrawer>
  );
}
