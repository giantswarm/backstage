import { render, screen } from '@testing-library/react';
import { InstallationChip } from './InstallationChip';

let mockInstallations: { name: string; pipeline?: string }[] = [];
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

describe('InstallationChip', () => {
  it('names the installation and carries its pipeline in the tooltip', () => {
    mockInstallations = [{ name: 'golem', pipeline: 'testing' }];

    render(<InstallationChip installation="golem" />);

    const chip = screen.getByTestId('installation-chip');
    expect(chip).toHaveTextContent('golem');
    expect(chip).toHaveAttribute('title', 'Installation golem (testing)');
  });

  it('works for an installation the configuration does not know', () => {
    mockInstallations = [];

    render(<InstallationChip installation="wombat" />);

    const chip = screen.getByTestId('installation-chip');
    expect(chip).toHaveTextContent('wombat');
    expect(chip).toHaveAttribute('title', 'Installation wombat');
  });
});
