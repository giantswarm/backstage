import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ClusterDeletingNotice } from './ClusterDeletingNotice';

const cluster = new Cluster(
  {
    apiVersion: 'cluster.x-k8s.io/v1beta2',
    kind: 'Cluster',
    metadata: {
      name: 'my-cluster',
      namespace: 'org-test',
      deletionTimestamp: '2026-09-30T10:00:00Z',
    },
    spec: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  'installation-a',
);

describe('ClusterDeletingNotice', () => {
  it('says the cluster is being deleted and the page follows it', async () => {
    await renderInTestApp(
      <ClusterDeletingNotice cluster={cluster} refreshError={null} />,
    );

    expect(
      screen.getByText('This cluster is being deleted'),
    ).toBeInTheDocument();
    expect(screen.getByText(/This page updates by itself/)).toBeInTheDocument();
  });

  it('says why the page could not re-read the cluster', async () => {
    await renderInTestApp(
      <ClusterDeletingNotice
        cluster={cluster}
        refreshError={new Error('service unavailable')}
      />,
    );

    expect(
      screen.getByText(
        /could not re-read all of the cluster and keeps trying: service unavailable/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/This page updates by itself/),
    ).not.toBeInTheDocument();
  });
});
