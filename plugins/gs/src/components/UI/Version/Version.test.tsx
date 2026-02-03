import { renderInTestApp } from '@backstage/test-utils';
import { cleanup } from '@testing-library/react';
import { Version, VersionProps } from './Version';

function renderComponent(props: VersionProps) {
  cleanup();

  return renderInTestApp(<Version {...props} />);
}

describe('<Version />', () => {
  it('renders version correctly', async () => {
    const testCases = [
      {
        version: '',
        expected: 'n/a',
      },
      {
        version: '0.24.2',
        expected: '0.24.2',
      },
      {
        version: 'v0.24.2',
        expected: '0.24.2',
      },
      {
        version: '0.24.2-beta',
        expected: '0.24.2-beta',
      },
      {
        version: 'v0.24.2-next.1',
        expected: '0.24.2-next.1',
      },
      {
        version: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
        expected: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
      },
      {
        version: 'v0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
        expected: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
      },
    ];

    for (const testCase of testCases) {
      const { getByText, queryByRole } = await renderComponent({
        version: testCase.version,
      });
      expect(getByText(testCase.expected)).toBeInTheDocument();
      expect(queryByRole('link')).not.toBeInTheDocument();
    }
  });

  describe('when source location is provided', () => {
    it('renders a link', async () => {
      const sourceLocation = 'https://github.com/organization/project-slug';
      const testCases = [
        {
          version: '0.24.2',
          expectedText: '0.24.2',
          expectedLink: `${sourceLocation}/releases/tag/v0.24.2`,
        },
        {
          version: '0.24.2-next.1',
          expectedText: '0.24.2-next.1',
          expectedLink: `${sourceLocation}/releases/tag/v0.24.2-next.1`,
        },
        {
          version: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
          expectedText: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
          expectedLink: `${sourceLocation}/commit/9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca`,
        },
      ];

      for (const testCase of testCases) {
        const { getByRole } = await renderComponent({
          version: testCase.version,
          sourceLocation,
        });
        expect(
          getByRole('link', { name: testCase.expectedText }),
        ).toHaveAttribute('href', testCase.expectedLink);
      }
    });
  });

  describe('when highlighted', () => {
    it('renders full version without truncation', async () => {
      const sourceLocation = 'https://github.com/organization/project-slug';
      const testCases = [
        {
          version: '0.24.2',
          highlight: true,
          expectedText: '0.24.2',
          expectedLink: `${sourceLocation}/releases/tag/v0.24.2`,
        },
        {
          version: '0.24.2-next.1',
          highlight: true,
          expectedText: '0.24.2-next.1',
          expectedLink: `${sourceLocation}/releases/tag/v0.24.2-next.1`,
        },
        {
          version: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
          highlight: true,
          expectedText: '0.24.2-9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca',
          expectedLink: `${sourceLocation}/commit/9ec68e75e1d35d5afea9ff9f03ccb2ca862ff6ca`,
        },
      ];

      for (const testCase of testCases) {
        const { getByRole } = await renderComponent({
          version: testCase.version,
          highlight: testCase.highlight,
          sourceLocation,
        });
        expect(
          getByRole('link', { name: testCase.expectedText }),
        ).toHaveAttribute('href', testCase.expectedLink);
      }
    });
  });

  describe('when warning', () => {
    it('renders a warning message', async () => {
      const testCases = [
        {
          version: '0.24.2',
          displayWarning: true,
          expected:
            'Last applied version is different from the attempted version.',
        },
        {
          version: '0.24.2',
          displayWarning: true,
          warningMessageVersion: '0.24.3',
          expected: 'Last attempted version is 0.24.3',
        },
      ];

      for (const testCase of testCases) {
        const { getByText } = await renderComponent({
          version: testCase.version,
          displayWarning: testCase.displayWarning,
          warningMessageVersion: testCase.warningMessageVersion,
        });
        expect(getByText(testCase.expected)).toBeInTheDocument();
      }
    });
  });
});
