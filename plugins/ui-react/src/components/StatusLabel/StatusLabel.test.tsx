import { render, screen } from '@testing-library/react';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { StatusLabel, StatusLabelIntent } from './StatusLabel';

const INTENTS: StatusLabelIntent[] = [
  'positive',
  'warning',
  'negative',
  'info',
  'neutral',
];

describe('StatusLabel', () => {
  it('renders the label as readable text', () => {
    render(<StatusLabel label="Ready" intent="positive" />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  // The reason this component exists: `core-components`' Status* hides its
  // children from assistive tech, so a status rendered that way reads as empty.
  it('keeps the label out of the icon, so it is not aria-hidden', () => {
    const { container } = render(
      <StatusLabel label="Not ready" intent="warning" />,
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).not.toHaveTextContent('Not ready');
    expect(screen.getByText('Not ready')).toBeInTheDocument();
  });

  it.each(INTENTS)('colours the icon from the %s bui token', intent => {
    const { container } = render(<StatusLabel label="State" intent={intent} />);

    const wrapper = container.querySelector('span[style]');
    // Deliberately asserts a `--bui-fg-*` custom property is used rather than a
    // literal colour, so the status themes with the rest of the app.
    expect(wrapper?.getAttribute('style')).toMatch(/var\(--bui-fg-[a-z]+\)/);
  });

  it('gives each intent a distinct default icon, so colour is not the only cue', () => {
    const paths = INTENTS.map(intent => {
      const { container, unmount } = render(
        <StatusLabel label="State" intent={intent} />,
      );
      const d = container.querySelector('path')?.getAttribute('d') ?? '';
      unmount();
      return d;
    });

    expect(paths.every(Boolean)).toBe(true);
    expect(new Set(paths).size).toBe(INTENTS.length);
  });

  it('accepts an icon override for domain-specific glyphs', () => {
    const { container: withDefault } = render(
      <StatusLabel label="Pending" intent="neutral" />,
    );
    const defaultPath = withDefault.querySelector('path')?.getAttribute('d');

    const { container: withOverride } = render(
      <StatusLabel
        label="Pending"
        intent="neutral"
        icon={HourglassEmptyIcon}
      />,
    );
    const overriddenPath = withOverride
      .querySelector('path')
      ?.getAttribute('d');

    expect(overriddenPath).toBeTruthy();
    expect(overriddenPath).not.toBe(defaultPath);
  });

  it('exposes the detail as a hover title', () => {
    render(
      <StatusLabel
        label="Not ready"
        intent="warning"
        title="Deployment is not ready, 0/1 pods are ready"
      />,
    );

    expect(
      screen.getByTitle('Deployment is not ready, 0/1 pods are ready'),
    ).toBeInTheDocument();
  });

  it('renders no title attribute when there is no detail', () => {
    const { container } = render(
      <StatusLabel label="Ready" intent="positive" />,
    );

    expect(container.querySelector('[title]')).toBeNull();
  });
});
