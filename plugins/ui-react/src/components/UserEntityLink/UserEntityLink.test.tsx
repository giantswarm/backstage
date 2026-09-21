import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  entityPresentationApiRef,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import { UserEntityLink } from './UserEntityLink';

/** The catalog's answer, stubbed: the real one resolves the display name. */
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

const renderLink = (element: React.ReactElement) =>
  renderInTestApp(
    <TestApiProvider
      apis={[
        [
          entityPresentationApiRef,
          presentationApi({ 'user:default/marians': 'Marian Steinbach' }),
        ],
      ]}
    >
      {element}
    </TestApiProvider>,
    { mountedRoutes: { '/catalog/:namespace/:kind/:name': entityRouteRef } },
  );

describe('UserEntityLink', () => {
  it('names the person and links to their entity', async () => {
    await renderLink(<UserEntityLink entityRef="user:default/marians" />);

    expect(
      screen.getByRole('link', { name: 'Marian Steinbach' }),
    ).toHaveAttribute('href', '/catalog/default/user/marians');
  });

  it('keeps the ref for someone the catalog does not know', async () => {
    // An outside contributor, or a bot: a bare login still reads as a person,
    // where a blank cell would read as missing data.
    await renderLink(<UserEntityLink entityRef="user:default/dependabot" />);

    expect(
      screen.getByRole('link', { name: 'dependabot' }),
    ).toBeInTheDocument();
  });

  it('shows the avatar without an accessible name of its own', async () => {
    // The name is already spelled out in the link beside it; announcing it
    // twice would be noise. (The photo itself cannot be asserted here -- bui's
    // Avatar only renders its initials fallback in jsdom, since no image loads.)
    await renderLink(
      <UserEntityLink
        entityRef="user:default/marians"
        displayName="Marian Steinbach"
        picture="https://avatars.example/marians.png"
      />,
    );

    expect(
      screen.queryByRole('img', { name: 'Marian Steinbach' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('stops a press from reaching the row behind it only when asked', async () => {
    const onRowPress = jest.fn();
    const user = userEvent.setup();

    const { unmount } = await renderLink(
      <div onClick={onRowPress} role="presentation">
        <UserEntityLink entityRef="user:default/marians" inRow />
      </div>,
    );
    await user.click(screen.getByRole('link', { name: 'Marian Steinbach' }));
    expect(onRowPress).not.toHaveBeenCalled();
    unmount();

    await renderLink(
      <div onClick={onRowPress} role="presentation">
        <UserEntityLink entityRef="user:default/marians" />
      </div>,
    );
    await user.click(screen.getByRole('link', { name: 'Marian Steinbach' }));
    expect(onRowPress).toHaveBeenCalledTimes(1);
  });
});
