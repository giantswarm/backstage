import React from 'react';
import { InfoCard, MarkdownContent } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';

export function RowList({ children }: { children: any }) {
  return <div className="RowList">{children}</div>;
}

export function Row({ label, children }: { label: string; children: any }) {
  return (
    <div className="Row" style={{ marginTop: 15, marginBottom: 15 }}>
      <div className="label">
        <strong>{label}</strong>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function InstallationDetailsCard() {
  const { entity } = useEntity();
  const sourceUrl = `https://github.com/giantswarm/installations/blob/master/${entity.metadata.name}/cluster.yaml`;

  return (
    <InfoCard title="Installation details">
      <RowList>
        <Row label="Code name">{entity.metadata.name}</Row>
        <Row label="Customer">
          {entity.metadata.labels?.['giantswarm.io/customer']}
        </Row>
        <Row label="Provider">
          {entity.metadata.labels?.['giantswarm.io/provider']}
        </Row>
        <Row label="Pipeline">
          {entity.metadata.labels?.['giantswarm.io/pipeline']}
        </Row>
        <Row label="Region">
          {entity.metadata.labels?.['giantswarm.io/region'] ?? (
            <em>not specified</em>
          )}
        </Row>
        {entity.metadata.annotations?.['giantswarm.io/escalation-matrix'] && (
          <Row label="Escalation matrix">
            <pre>
              {entity.metadata.annotations?.['giantswarm.io/escalation-matrix']}
            </pre>
          </Row>
        )}
        <Row label="Source of this information">
          <MarkdownContent content={sourceUrl} dialect="gfm" />
        </Row>
      </RowList>
    </InfoCard>
  );
}
