import type { Meta, StoryObj } from '@storybook/react';
import { TestApiProvider } from '@backstage/test-utils';
import {
  entityPresentationApiRef,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import { UserEntityLink } from './UserEntityLink';

/**
 * A stand-in for the catalog's presentation API: it answers with the display
 * name the story wants instead of reaching for a catalog. The real one resolves
 * `spec.profile.displayName`, and falls back to the ref's own name for a person
 * the catalog does not know.
 */
function presentationApi(titles: Record<string, string>) {
  return {
    forEntity: (ref: string) => {
      const snapshot = {
        entityRef: ref,
        primaryTitle: titles[ref] ?? ref.split('/').pop() ?? ref,
        secondaryTitle: ref,
        Icon: undefined,
      };
      return { snapshot, promise: Promise.resolve(snapshot) };
    },
  };
}

const TITLES = {
  'user:default/marians': 'Marian Steinbach',
  'user:default/teemow': 'Timo Derstappen',
};

const meta = {
  title: 'Components/UserEntityLink',
  component: UserEntityLink,
  tags: ['autodocs'],
  parameters: {
    // `EntityRefLink` resolves the entity page through the catalog plugin's
    // route, which needs a real app around it -- the global decorator's plain
    // MemoryRouter raises "Routing context is not available", and an app of our
    // own on top of that router would make react-router throw. Asking for the
    // app here lets the decorator mount it *instead of* the plain router.
    testApp: {
      mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
    },
    docs: {
      description: {
        component:
          'A person: their photo, their display name, and a link to their catalog User entity. ' +
          'The name and link come from `EntityRefLink`, so a ref the catalog does not know ' +
          'degrades to the ref’s own name rather than rendering blank. The photo is passed ' +
          'in, because `DefaultEntityPresentationApi` fetches a fixed field list that ' +
          '`spec.profile.picture` is not part of.',
      },
    },
  },
  // Inside the app the decorator mounts above, so this overrides the app's own
  // registration of the presentation API rather than being overridden by it.
  decorators: [
    Story => (
      <TestApiProvider
        apis={[[entityPresentationApiRef, presentationApi(TITLES)]]}
      >
        <Story />
      </TestApiProvider>
    ),
  ],
} satisfies Meta<typeof UserEntityLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The everyday case: the catalog knows the person and has their photo. */
export const Default: Story = {
  args: {
    entityRef: 'user:default/marians',
    displayName: 'Marian Steinbach',
    picture: 'https://avatars.githubusercontent.com/u/273727?v=4',
  },
};

/**
 * No photo on the profile: the avatar falls back to the initials of the display
 * name rather than leaving a gap.
 */
export const WithoutPhoto: Story = {
  args: {
    entityRef: 'user:default/teemow',
    displayName: 'Timo Derstappen',
  },
};

/**
 * A login the catalog has no User for -- an outside contributor, or a bot. The
 * link keeps the login rather than rendering blank.
 */
export const UnknownToTheCatalog: Story = {
  args: {
    entityRef: 'user:default/dependabot',
  },
};

/**
 * Inside a table or list row that acts on a press anywhere within it. `inRow`
 * keeps a click on the link from also triggering the row behind it.
 */
export const InsideARow: Story = {
  args: {
    entityRef: 'user:default/marians',
    displayName: 'Marian Steinbach',
    picture: 'https://avatars.githubusercontent.com/u/273727?v=4',
    inRow: true,
  },
};
