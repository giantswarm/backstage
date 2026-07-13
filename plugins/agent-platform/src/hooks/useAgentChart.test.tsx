import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { configApiRef } from '@backstage/core-plugin-api';
import { ConfigReader } from '@backstage/config';
import { TestApiProvider } from '@backstage/test-utils';
import {
  useHelmChartTags,
  useHelmChartValuesYaml,
} from '@giantswarm/backstage-plugin-gs';
import { useAgentChart } from './useAgentChart';

// useAgentChart composes the gs Helm-chart hooks; mock them so the test drives
// the composition (version fallback + prompt parsing) directly.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useHelmChartTags: jest.fn(),
  useHelmChartValuesYaml: jest.fn(),
}));

const mockTags = useHelmChartTags as jest.Mock;
const mockValues = useHelmChartValuesYaml as jest.Mock;

function renderWith() {
  const configApi = new ConfigReader({
    agentPlatform: {
      chart: {
        ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
        version: '0.1.0',
      },
    },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[configApiRef, configApi]]}>
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useAgentChart(), { wrapper });
}

beforeEach(() => {
  mockTags.mockReset();
  mockValues.mockReset();
});

describe('useAgentChart', () => {
  it('resolves the latest tag and the chart default system prompt', () => {
    mockTags.mockReturnValue({
      latestStableVersion: '0.2.0',
      isLoading: false,
      error: null,
    });
    mockValues.mockReturnValue({
      valuesYaml: 'agent:\n  systemMessage: |\n    You are a helpful agent.\n',
      isLoading: false,
      error: null,
    });

    const { result } = renderWith();

    expect(result.current.version).toBe('0.2.0');
    expect(result.current.defaultSystemMessage).toBe(
      'You are a helpful agent.',
    );
    // The values hook is asked for the resolved version.
    expect(mockValues).toHaveBeenCalledWith(
      'gsoci.azurecr.io/charts/giantswarm/agent',
      '0.2.0',
    );
  });

  it('falls back to the configured version when no stable tag is published', () => {
    mockTags.mockReturnValue({
      latestStableVersion: null,
      isLoading: false,
      error: null,
    });
    mockValues.mockReturnValue({
      valuesYaml: null,
      isLoading: false,
      error: null,
    });

    const { result } = renderWith();

    expect(result.current.version).toBe('0.1.0');
    expect(result.current.defaultSystemMessage).toBe('');
  });

  it('returns an empty prompt (not an error) when values.yaml is malformed', () => {
    mockTags.mockReturnValue({
      latestStableVersion: '0.2.0',
      isLoading: false,
      error: null,
    });
    mockValues.mockReturnValue({
      valuesYaml: 'agent: [unclosed',
      isLoading: false,
      error: null,
    });

    const { result } = renderWith();

    // The bad prompt lookup must not drop the already-resolved version.
    expect(result.current.version).toBe('0.2.0');
    expect(result.current.defaultSystemMessage).toBe('');
  });
});
