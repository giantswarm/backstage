import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { installationsExternalRouteRef } from '../../routes';
import {
  KagentMissingCard,
  type KagentMissingCardProps,
} from './KagentMissingCard';

function render(
  props: KagentMissingCardProps,
  { installationsPage = true } = {},
) {
  return renderInTestApp(<KagentMissingCard {...props} />, {
    mountedRoutes: installationsPage
      ? { '/installations': installationsExternalRouteRef }
      : {},
  });
}

describe('KagentMissingCard', () => {
  it.each([
    [
      { installations: ['dingo'], canChooseAnother: true },
      'Choose another environment, or enable the Agent Platform on dingo.',
    ],
    [
      { installations: ['dingo'], canChooseAnother: false },
      'Enable the Agent Platform on dingo to create agents there.',
    ],
    [
      { installations: ['dingo', 'gazelle'], canChooseAnother: false },
      'Enable the Agent Platform on one of your environments to create agents.',
    ],
  ])(
    'links to the Installations page where the portal has it (%j)',
    async (props, remedy) => {
      await render(props);

      expect(screen.getByText(remedy, { exact: false })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Go to Installations' }),
      ).toHaveAttribute('href', '/installations');
    },
  );

  it.each([
    [
      { installations: ['dingo'], canChooseAnother: true },
      'Choose another environment, or ask your platform team to enable the Agent Platform on dingo.',
    ],
    [
      { installations: ['dingo'], canChooseAnother: false },
      'Ask your platform team to enable the Agent Platform on dingo to create agents there.',
    ],
    [
      { installations: ['dingo', 'gazelle'], canChooseAnother: false },
      'Ask your platform team to enable the Agent Platform on one of your environments to create agents.',
    ],
  ])(
    'names who enables kagent where the portal disables the Installations page (%j)',
    async (props, remedy) => {
      await render(props, { installationsPage: false });

      expect(screen.getByText(remedy, { exact: false })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Go to Installations' }),
      ).not.toBeInTheDocument();
    },
  );
});
