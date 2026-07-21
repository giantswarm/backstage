import { act, render } from '@testing-library/react';
import { AgentAvatarPreview } from './AgentAvatarPreview';

type FormState = {
  name: string;
  slug: string;
  installation: string | undefined;
};

let mockState: FormState;
let mockInstallations: { name: string; baseDomain?: string }[];
const mockBuild = jest.fn(
  () => 'https://avatars.example/v1/preview/96/seed.png',
);

jest.mock('../NewAgentFormProvider', () => ({
  useNewAgentForm: () => ({ state: mockState }),
}));

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: false,
  }),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuild,
}));

describe('AgentAvatarPreview', () => {
  beforeEach(() => {
    mockBuild.mockClear();
    mockState = {
      name: 'Go dev',
      slug: 'go-developer',
      installation: undefined,
    };
    mockInstallations = [
      { name: 'no-domain' },
      { name: 'graveler', baseDomain: 'graveler.example' },
      { name: 'gazelle', baseDomain: 'gazelle.example' },
    ];
  });

  it('previews the slug (technical name) via the no-cache route at 2× size', () => {
    mockState.installation = 'gazelle';

    render(<AgentAvatarPreview />);

    expect(mockBuild).toHaveBeenCalledWith('gazelle', 'go-developer', {
      size: 128,
      preview: true,
    });
  });

  it('falls back to the first configured installation with a base domain', () => {
    render(<AgentAvatarPreview />);

    // Skips `no-domain` (no baseDomain), lands on `graveler`.
    expect(mockBuild).toHaveBeenCalledWith('graveler', 'go-developer', {
      size: 128,
      preview: true,
    });
  });

  it('debounces slug changes before requesting a new preview', () => {
    jest.useFakeTimers();
    try {
      mockState = { name: '', slug: 'go', installation: 'graveler' };
      const { rerender } = render(<AgentAvatarPreview />);

      mockBuild.mockClear();
      mockState = { ...mockState, slug: 'go-developer' };
      rerender(<AgentAvatarPreview />);

      // Not yet debounced: still the previous slug.
      expect(mockBuild).toHaveBeenLastCalledWith('graveler', 'go', {
        size: 128,
        preview: true,
      });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(mockBuild).toHaveBeenLastCalledWith('graveler', 'go-developer', {
        size: 128,
        preview: true,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
