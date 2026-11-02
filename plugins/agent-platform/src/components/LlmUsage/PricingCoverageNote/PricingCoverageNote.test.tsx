import { render, screen } from '@testing-library/react';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { UnpricedModelRow } from '../../../lib/llmUsage';
import { PricingCoverageNote } from './PricingCoverageNote';

const ROWS: UnpricedModelRow[] = [
  {
    id: 'lab-alias|qwen3-14b-instruct-awq|Missing',
    requestModel: 'lab-alias',
    responseModel: 'qwen3-14b-instruct-awq',
    status: 'Missing',
    lookups: 120,
  },
  {
    id: 'gpt-x|gpt-x|Unpriced',
    requestModel: 'gpt-x',
    responseModel: 'gpt-x',
    status: 'Unpriced',
    lookups: 3,
  },
];

const headers = () =>
  screen.getAllByRole('columnheader').map(cell => cell.textContent?.trim());

// T22 B10: four columns in 343px clipped the model ids and the reason.
describe('PricingCoverageNote', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  it('keeps the answered model and why at phone width, naming the requested model under it', () => {
    layout = mockPhoneLayout();
    render(<PricingCoverageNote rows={ROWS} />);

    expect(headers()).toEqual(['Answered model', 'Why']);
    expect(screen.getByText('Requested as lab-alias')).toBeVisible();
    // A model requested under its own name says nothing twice.
    expect(screen.queryByText('Requested as gpt-x')).toBeNull();
    // The reason wraps rather than being cut to a line.
    expect(
      screen.getByText(/in neither agentgateway's built-in catalogue/),
    ).not.toHaveAttribute('data-truncate');
  });

  it('keeps every column on a desktop', () => {
    layout = mockDesktopLayout();
    render(<PricingCoverageNote rows={ROWS} />);

    expect(headers()).toEqual([
      'Answered model',
      'Requested model',
      'Why',
      'Lookups',
    ]);
    expect(screen.queryByText(/^Requested as/)).toBeNull();
  });

  it('renders nothing when every model is priced', () => {
    layout = mockPhoneLayout();
    const { container } = render(<PricingCoverageNote rows={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
