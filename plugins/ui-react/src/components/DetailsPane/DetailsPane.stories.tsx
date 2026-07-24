import type { Meta, StoryObj } from '@storybook/react';
import { StructuredMetadataList } from '../StructuredMetadataList';
import { DetailsPane } from './DetailsPane';
import { componentDocs } from '../../storybook/docs';

// The pane opens itself from URL query params (via `useDetailsPane`). Seed the
// router so the story renders in the open state.
const openRoute =
  '/?pane=demo&cluster=abc12&kind=Cluster&namespace=org-giantswarm&name=production';

const meta = {
  title: 'Components/DetailsPane',
  component: DetailsPane,
  tags: ['autodocs'],
  parameters: {
    router: { initialEntries: [openRoute] },
    docs: {
      // The component is a full-height, right-anchored drawer. Render it in an
      // isolated iframe with extra height in the docs page so the whole pane is
      // visible instead of a thin clipped slice.
      story: { inline: false, height: '640px' },
      description: {
        component: componentDocs({
          summary:
            'A right-anchored drawer whose open/closed state and target resource ' +
            'live in URL query params (via the `useDetailsPane` hook), so a details ' +
            'view is deep-linkable and survives reloads. It renders content through ' +
            'a `render` prop given the resource coordinates (cluster, kind, ' +
            'namespace, name).',
          whenToUse:
            'For a “click a row → open its details beside the list” pattern where ' +
            'the open item should be shareable via URL. Pair it with the ' +
            '`useDetailsPane` hook’s `open()`/`getRoute()` to open the pane from a ' +
            'table row.',
          migration: 'mui-v4',
          extra:
            'This story seeds the router with `?pane=demo&…` so the drawer renders ' +
            'open; in the app the pane is opened by navigating to such a URL.',
        }),
      },
    },
  },
} satisfies Meta<typeof DetailsPane>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    paneId: 'demo',
    title: props => `${props.kind} ${props.name}`,
    render: props => (
      <StructuredMetadataList
        metadata={{
          Kind: props.kind,
          Name: props.name,
          Namespace: props.namespace,
          Cluster: props.cluster,
        }}
      />
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Opened via URL params. The drawer slides in from the right with a close ' +
          'button; `title` here is derived from the resource.',
      },
    },
  },
};
