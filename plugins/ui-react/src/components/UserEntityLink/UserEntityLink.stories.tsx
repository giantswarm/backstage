import type { Meta, StoryObj } from '@storybook/react';
import { TestApiProvider, wrapInTestApp } from '@backstage/test-utils';
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
    // The test app below mounts a router of its own, and react-router throws on
    // a `<Router>` inside a `<Router>` -- so the global decorator's one stands
    // down for this story.
    router: { disable: true },
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
  // `EntityRefLink` resolves the entity page through the catalog plugin's route,
  // so the story needs an app with that route mounted -- the global decorator's
  // MemoryRouter alone raises "Routing context is not available".
  decorators: [
    Story =>
      wrapInTestApp(
        <TestApiProvider
          apis={[[entityPresentationApiRef, presentationApi(TITLES)]]}
        >
          <Story />
        </TestApiProvider>,
        {
          mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef },
        },
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
