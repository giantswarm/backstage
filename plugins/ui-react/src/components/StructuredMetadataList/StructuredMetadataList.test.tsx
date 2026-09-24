import { render, screen } from '@testing-library/react';
import { StructuredMetadataList } from './StructuredMetadataList';

// jsdom has no ResizeObserver, which the container-width layout switch uses.
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('StructuredMetadataList', () => {
  it('renders the metadata as a description list of terms and descriptions', () => {
    const { container } = render(
      <StructuredMetadataList
        metadata={{
          Provider: 'aws',
          Region: <a href="https://example.com">eu-central-1</a>,
        }}
      />,
    );

    const list = container.querySelector('dl');
    expect(list).not.toBeNull();
    expect(
      Array.from(list!.querySelectorAll('dt')).map(term => term.textContent),
    ).toEqual(['Provider', 'Region']);
    expect(
      Array.from(list!.querySelectorAll('dd')).map(desc => desc.textContent),
    ).toEqual(['aws', 'eu-central-1']);
    expect(screen.getByRole('link', { name: 'eu-central-1' })).toBeVisible();
  });

  it('does not render the keys as headings', () => {
    render(<StructuredMetadataList metadata={{ Provider: 'aws' }} />);

    expect(screen.queryByRole('heading')).toBeNull();
  });
});
