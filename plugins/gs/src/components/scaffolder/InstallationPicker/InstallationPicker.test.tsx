import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { InstallationPicker } from './InstallationPicker';
import { InstallationInfo } from '../../hooks/useInstallationsInfo';

const mockInstallationsInfo: InstallationInfo[] = [
  {
    name: 'gorilla',
    pipeline: 'stable',
    providers: ['aws'],
    baseDomain: 'gorilla.example.com',
    region: 'eu-west-1',
  },
  {
    name: 'pangolin',
    pipeline: 'stable',
    providers: ['aws'],
    baseDomain: 'pangolin.example.com',
    region: 'eu-north-1',
  },
  {
    name: 'grizzly',
    pipeline: 'stable',
    providers: ['aws'],
    baseDomain: 'grizzly.example.com',
    region: 'us-east-1',
  },
  {
    name: 'capybara',
    pipeline: 'stable',
    providers: ['aws'],
    baseDomain: 'capybara.example.com',
    region: 'eu-north-2',
  },
];

jest.mock('../../hooks', () => ({
  useInstallationsInfo: () => ({
    installationsInfo: mockInstallationsInfo,
  }),
  useDisabledInstallations: () => ({
    isLoading: false,
    disabledInstallations: [],
  }),
}));

jest.mock('../hooks/useValueFromOptions', () => ({
  useValueFromOptions: () => undefined,
}));

function renderPicker(
  props: Partial<Parameters<typeof InstallationPicker>[0]> = {},
) {
  const defaultProps = {
    onChange: jest.fn(),
    onBlur: jest.fn(),
    onFocus: jest.fn(),
    rawErrors: [],
    required: false,
    formData: undefined,
    schema: { title: 'Installation', description: 'Installation name' },
    uiSchema: {
      'ui:options': {
        allowedProviders: ['aws'],
        allowedPipelines: [],
      },
    },
    idSchema: { $id: 'test-installation' },
    formContext: { formData: {} },
    ...props,
  };

  return renderInTestApp(<InstallationPicker {...(defaultProps as any)} />);
}

describe('InstallationPicker', () => {
  it('sorts eu-north-* installations to the top', async () => {
    await renderPicker();

    const radioGroup = screen.getByRole('radiogroup');
    const radios = within(radioGroup).getAllByRole('radio');

    const labels = radios.map(radio => {
      const label = radio.closest('label');
      return label?.textContent ?? '';
    });

    // eu-north-* installations should come first
    expect(labels[0]).toContain('pangolin');
    expect(labels[0]).toContain('eu-north-1');
    expect(labels[1]).toContain('capybara');
    expect(labels[1]).toContain('eu-north-2');

    // Other installations should follow in original order
    expect(labels[2]).toContain('gorilla');
    expect(labels[3]).toContain('grizzly');
  });

  it('auto-selects the first eu-north-* installation by default', async () => {
    const onChange = jest.fn();
    await renderPicker({ onChange });

    const radioGroup = screen.getByRole('radiogroup');
    const radios = within(radioGroup).getAllByRole('radio');

    // First radio (pangolin, eu-north-1) should be checked
    expect(radios[0]).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        installationName: 'pangolin',
      }),
    );
  });

  it('preserves relative order of non-eu-north installations', async () => {
    await renderPicker();

    const radioGroup = screen.getByRole('radiogroup');
    const radios = within(radioGroup).getAllByRole('radio');

    const labels = radios.map(radio => {
      const label = radio.closest('label');
      return label?.textContent ?? '';
    });

    // gorilla (eu-west-1) should come before grizzly (us-east-1),
    // preserving original order
    const gorillaIdx = labels.findIndex(l => l.includes('gorilla'));
    const grizzlyIdx = labels.findIndex(l => l.includes('grizzly'));
    expect(gorillaIdx).toBeLessThan(grizzlyIdx);
  });
});
