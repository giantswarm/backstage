import { Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { Link, MarkdownContent } from '@backstage/core-components';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { useEntity } from '@backstage/plugin-catalog-react';
import { AboutField, ScrollContainer } from '../../UI';

const useStyles = makeStyles({
  notSpecified: {
    color: '#aaa',
  },
});

export function EntityInstallationDetailsCard() {
  const classes = useStyles();

  const notSpecified = (
    <span className={classes.notSpecified}>Not specified</span>
  );

  const { entity } = useEntity();

  return (
    <Flex direction="column" gap="5">
      <InfoCard title="Installation details">
        <Flex direction="column" gap="5">
          <Flex gap="5" style={{ flexWrap: 'wrap' }}>
            <AboutField
              label="Customer"
              value={entity.metadata.labels?.['giantswarm.io/customer']}
            />
            <AboutField
              label="Provider"
              value={entity.metadata.labels?.['giantswarm.io/provider']}
            />
            <AboutField
              label="Pipeline"
              value={entity.metadata.labels?.['giantswarm.io/pipeline']}
            />
            <AboutField
              label="Region"
              value={entity.metadata.labels?.['giantswarm.io/region']}
            />
            <AboutField
              label="Base domain"
              value={entity.metadata.annotations?.['giantswarm.io/base']}
            />
            <AboutField
              label="Account engineer"
              value={
                entity.metadata.annotations?.['giantswarm.io/account-engineer']
              }
            />
            {entity.metadata.annotations?.['giantswarm.io/custom-ca'] && (
              <AboutField label="Custom CA" value="">
                <Link
                  to={entity.metadata.annotations?.['giantswarm.io/custom-ca']}
                  externalLinkIcon
                >
                  YES
                </Link>
              </AboutField>
            )}
          </Flex>

          <AboutField label="Escalation matrix">
            <ScrollContainer>
              {(entity.metadata.annotations?.[
                'giantswarm.io/escalation-matrix'
              ] && (
                <pre>
                  {
                    entity.metadata.annotations?.[
                      'giantswarm.io/escalation-matrix'
                    ]
                  }
                </pre>
              )) ||
                notSpecified}
            </ScrollContainer>
          </AboutField>
        </Flex>
      </InfoCard>

      {entity.metadata.annotations?.['giantswarm.io/access-docs-markdown'] && (
        <InfoCard title="Non-standard access">
          <MarkdownContent
            content={
              entity.metadata.annotations?.[
                'giantswarm.io/access-docs-markdown'
              ]
            }
          />
        </InfoCard>
      )}
    </Flex>
  );
}
