import { useState } from 'react';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const walrus: InstallationInfo = {
  name: 'walrus',
  pipeline: 'stable',
  providers: ['azure'],
  baseDomain: 'walrus.example.com',
  region: 'us-west-2',
};

let mockInstallations: InstallationInfo[] = mockInstallationsInfo;
let mockInstallationsLoading = false;
let mockDisabled: { isLoading: boolean; disabledInstallations: string[] };
// Re-render subscribers, so a case can change what the hooks return after the
// first render (installations arriving, a health check answering).
const mockListeners = new Set<() => void>();

jest.mock('../../hooks', () => {
  const { useEffect, useReducer } = jest.requireActual('react');
  function useUpdates() {
    const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      mockListeners.add(forceUpdate);
      return () => {
        mockListeners.delete(forceUpdate);
      };
    }, []);
  }
  return {
    useInstallationsInfo: () => {
      useUpdates();
      return {
        installationsInfo: mockInstallations,
        isLoading: mockInstallationsLoading,
      };
    },
    useDisabledInstallations: () => {
      useUpdates();
      return mockDisabled;
    },
  };
});

function updateMocks(update: () => void) {
  act(() => {
    update();
    mockListeners.forEach(listener => listener());
  });
}

let setFormContext: (formContext: { formData: object }) => void;

/** Holds `formContext` in state, so a case can change sibling form values. */
function FormContextHarness(props: Parameters<typeof InstallationPicker>[0]) {
  const [formContext, setState] = useState(props.formContext);
  setFormContext = setState;
  return <InstallationPicker {...props} formContext={formContext} />;
}

jest.mock('../hooks/useValueFromOptions', () => ({
  useValueFromOptions: () => undefined,
}));

function lastSelected(onChange: jest.Mock) {
  return onChange.mock.calls[onChange.mock.calls.length - 1]?.[0]
    ?.installationName;
}

function radioFor(name: string) {
  return screen.getByRole('radio', { name: new RegExp(`^${name}`) });
}

function renderPicker(
  props: Partial<Parameters<typeof InstallationPicker>[0]> = {},
  { withFormContextState = false } = {},
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

  const Picker = withFormContextState ? FormContextHarness : InstallationPicker;
  return renderInTestApp(<Picker {...(defaultProps as any)} />);
}

const noAutoSelect = {
  'ui:options': {
    autoSelectFirstValue: false,
    widget: 'radio',
    allowedProviders: ['aws'],
    allowedPipelines: [],
  },
};

describe('InstallationPicker', () => {
  beforeEach(() => {
    mockInstallations = mockInstallationsInfo;
    mockInstallationsLoading = false;
    mockDisabled = { isLoading: false, disabledInstallations: [] };
  });

  it('hides the field and selects the only installation', async () => {
    mockInstallations = [mockInstallationsInfo[0]];
    const onChange = jest.fn();
    await renderPicker({ onChange, uiSchema: noAutoSelect });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ installationName: 'gorilla' }),
    );
  });

  it('stays hidden while the only installation’s health check is pending', async () => {
    mockInstallations = [mockInstallationsInfo[0]];
    // A `backendUrl` override counts as disabled until its check answers.
    mockDisabled = { isLoading: true, disabledInstallations: ['gorilla'] };
    const onChange = jest.fn();
    await renderPicker({ onChange, uiSchema: noAutoSelect });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastSelected(onChange)).toBeUndefined();

    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: [] };
    });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

  it('withdraws the only installation once it becomes disabled, and keeps the field shown after', async () => {
    mockInstallations = [mockInstallationsInfo[0]];
    const onChange = jest.fn();
    await renderPicker({ onChange, uiSchema: noAutoSelect });
    expect(lastSelected(onChange)).toBe('gorilla');

    // A later health-check poll fails.
    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: ['gorilla'] };
    });

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(radioFor('gorilla')).toBeDisabled();
    expect(radioFor('gorilla')).not.toBeChecked();
    expect(lastSelected(onChange)).toBeUndefined();

    // It recovers: selected again, but the field no longer vanishes.
    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: [] };
    });

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(radioFor('gorilla')).toBeChecked();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

  it('preselects the only active installation of several, keeping the field shown', async () => {
    mockInstallations = [mockInstallationsInfo[0], mockInstallationsInfo[2]];
    mockDisabled = { isLoading: false, disabledInstallations: ['grizzly'] };
    const onChange = jest.fn();
    await renderPicker({ onChange, uiSchema: noAutoSelect });

    // The greyed-out option explains why there is no choice.
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(radioFor('grizzly')).toBeDisabled();
    expect(radioFor('gorilla')).toBeChecked();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

  it("withdraws the person's pick when it becomes disabled, without switching to another installation", async () => {
    // Default `autoSelectFirstValue: true`: the eu-north-* pangolin is the
    // default, the person picks grizzly instead.
    const onChange = jest.fn();
    await renderPicker({ onChange });
    await userEvent.click(radioFor('grizzly'));
    expect(lastSelected(onChange)).toBe('grizzly');

    // One slow health-check answer marks the pick as disabled.
    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: ['grizzly'] };
    });

    expect(lastSelected(onChange)).toBeUndefined();
    for (const name of ['gorilla', 'pangolin', 'grizzly', 'capybara']) {
      expect(radioFor(name)).not.toBeChecked();
    }

    // Nor is another installation picked once the check recovers.
    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: [] };
    });
    expect(lastSelected(onChange)).toBeUndefined();
  });

  it('replaces a pick that becomes disabled with the only installation still active', async () => {
    mockInstallations = [mockInstallationsInfo[0], mockInstallationsInfo[2]];
    const onChange = jest.fn();
    await renderPicker({ onChange });
    await userEvent.click(radioFor('grizzly'));

    updateMocks(() => {
      mockDisabled = { isLoading: false, disabledInstallations: ['grizzly'] };
    });

    expect(radioFor('gorilla')).toBeChecked();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

  describe('when allowedProvidersField narrows the list to one and widens it again', () => {
    const uiSchemaFor = (autoSelectFirstValue: boolean) => ({
      'ui:options': {
        autoSelectFirstValue,
        widget: 'radio',
        allowedProvidersField: 'provider',
        allowedPipelines: [],
      },
    });

    beforeEach(() => {
      mockInstallations = [mockInstallationsInfo[0], walrus];
    });

    it('withdraws the auto-picked value without autoSelectFirstValue', async () => {
      const onChange = jest.fn();
      await renderPicker(
        {
          onChange,
          uiSchema: uiSchemaFor(false),
          formContext: { formData: { provider: 'aws' } },
        },
        { withFormContextState: true },
      );
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(lastSelected(onChange)).toBe('gorilla');

      act(() => setFormContext({ formData: { provider: ['aws', 'azure'] } }));

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(radioFor('gorilla')).not.toBeChecked();
      expect(radioFor('walrus')).not.toBeChecked();
      expect(lastSelected(onChange)).toBeUndefined();
    });

    it('keeps it with autoSelectFirstValue, which would pick one anyway', async () => {
      const onChange = jest.fn();
      await renderPicker(
        {
          onChange,
          uiSchema: uiSchemaFor(true),
          formContext: { formData: { provider: 'aws' } },
        },
        { withFormContextState: true },
      );

      act(() => setFormContext({ formData: { provider: ['aws', 'azure'] } }));

      expect(radioFor('gorilla')).toBeChecked();
      expect(lastSelected(onChange)).toBe('gorilla');
    });
  });

  it('replaces a stale value outside the list with the only installation', async () => {
    mockInstallations = [mockInstallationsInfo[0]];
    const onChange = jest.fn();
    await renderPicker({
      onChange,
      uiSchema: noAutoSelect,
      formData: { installationName: 'gone' },
    });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

  it('replaces a stale value outside the list with the default', async () => {
    const onChange = jest.fn();
    await renderPicker({ onChange, formData: { installationName: 'gone' } });

    expect(radioFor('pangolin')).toBeChecked();
    expect(lastSelected(onChange)).toBe('pangolin');
  });

  it('keeps a restored value while the list is still loading', async () => {
    mockInstallations = [];
    mockInstallationsLoading = true;
    const onChange = jest.fn();
    await renderPicker({ onChange, formData: { installationName: 'grizzly' } });

    updateMocks(() => {
      mockInstallations = mockInstallationsInfo;
      mockInstallationsLoading = false;
    });

    expect(radioFor('grizzly')).toBeChecked();
    expect(lastSelected(onChange)).toBe('grizzly');
  });

  it('selects and hides the only installation once the list arrives', async () => {
    mockInstallations = [];
    mockInstallationsLoading = true;
    const onChange = jest.fn();
    await renderPicker({ onChange, uiSchema: noAutoSelect });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastSelected(onChange)).toBeUndefined();

    updateMocks(() => {
      mockInstallations = [mockInstallationsInfo[0]];
      mockInstallationsLoading = false;
    });

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastSelected(onChange)).toBe('gorilla');
  });

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
