import { type ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import { FluxResourcesTreeView } from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';

const useStyles = makeStyles({
  // The tree view manages its own height and reaches the viewport edges, so
  // drop Content's top padding. Otherwise it stacks with the plugin header's
  // bottom margin into an oversized gap above the content. `&&` doubles the
  // selector specificity so it wins over BackstageContent-root regardless of
  // stylesheet injection order.
  content: {
    '&&': {
      paddingTop: 0,
    },
  },
});

export function FluxResourcesTreePage({ filters }: { filters: ReactNode }) {
  const classes = useStyles();

  return (
    <QueryClientProvider>
      <Content className={classes.content}>
        <FluxResourcesTreeView filters={filters} />
      </Content>
    </QueryClientProvider>
  );
}
