import React from 'react';
import { Grid } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { InfoCard, Link, MarkdownContent } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { AboutField } from '@backstage/plugin-catalog';

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
    <>
      <Grid item xs={12}>
        <InfoCard title="Installation details">
          <Grid container spacing={5}>
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
          </Grid>
          <Grid container spacing={5}>
            <AboutField label="Escalation matrix">
              <>
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
              </>
            </AboutField>
          </Grid>
        </InfoCard>
      </Grid>
      <Grid item xs={12}>
        {entity.metadata.annotations?.[
          'giantswarm.io/access-docs-markdown'
        ] && (
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
      </Grid>
    </>
  );
}
