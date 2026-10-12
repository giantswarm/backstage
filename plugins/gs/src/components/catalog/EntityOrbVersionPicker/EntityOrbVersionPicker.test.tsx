import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { MockEntityListContextProvider } from '@backstage/plugin-catalog-react/testUtils';
import { EntityOrbVersionFilter } from '../filters';
import { EntityOrbVersionPicker } from './EntityOrbVersionPicker';

const facet = 'metadata.labels.giantswarm.io/architect-orb-version';

async function renderPicker(updateFilters = jest.fn()) {
  const catalogApi = {
    getEntityFacets: jest.fn().mockResolvedValue({
      facets: {
        [facet]: ['10.10.0', '10.2.0', '9.6.0'].map(value => ({
          value,
          count: 1,
        })),
      },
    }),
  };

  await renderInTestApp(
    <TestApiProvider apis={[[catalogApiRef, catalogApi as any]]}>
      <MockEntityListContextProvider value={{ updateFilters }}>
        <EntityOrbVersionPicker />
      </MockEntityListContextProvider>
    </TestApiProvider>,
  );

  return updateFilters;
}

describe('EntityOrbVersionPicker', () => {
  it('is a dropdown listing the newest orb first', async () => {
    await renderPicker();

    expect(
      await screen.findByText('Architect Orb Version'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('orbVersions-picker-expand'));

    const options = await screen.findAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      '10.10.0',
      '10.2.0',
      '9.6.0',
    ]);
  });

  it('filters on the selected version', async () => {
    const updateFilters = await renderPicker();

    await userEvent.click(
      await screen.findByTestId('orbVersions-picker-expand'),
    );
    await userEvent.click(await screen.findByText('10.2.0'));

    await waitFor(() =>
      expect(updateFilters).toHaveBeenLastCalledWith({
        orbVersions: new EntityOrbVersionFilter(['10.2.0']),
      }),
    );
  });
});
