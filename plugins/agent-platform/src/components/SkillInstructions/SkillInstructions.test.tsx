import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { resolveInstructionHref, SkillInstructions } from './SkillInstructions';

const SOURCE =
  'https://github.com/giantswarm/skills/tree/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2/ticket-triage';

describe('resolveInstructionHref', () => {
  it('keeps absolute web and mail links', () => {
    expect(resolveInstructionHref('https://example.com/x', SOURCE)).toBe(
      'https://example.com/x',
    );
    expect(resolveInstructionHref('mailto:team@example.com', SOURCE)).toBe(
      'mailto:team@example.com',
    );
  });

  it('resolves a relative link into the skill folder, never the portal', () => {
    expect(resolveInstructionHref('references/setup.md', SOURCE)).toBe(
      `${SOURCE}/references/setup.md`,
    );
    expect(resolveInstructionHref('./a.md', `${SOURCE}/`)).toBe(
      `${SOURCE}/a.md`,
    );
    // Without a source to resolve against, it stays text.
    expect(
      resolveInstructionHref('references/setup.md', undefined),
    ).toBeUndefined();
  });

  it('leaves anchors, root-relative paths and other schemes as text', () => {
    expect(resolveInstructionHref('#usage', SOURCE)).toBeUndefined();
    expect(resolveInstructionHref('/catalog', SOURCE)).toBeUndefined();
    // Built, so the linter does not read the test's input as a script URL.
    const scriptUrl = ['javascript', 'alert(1)'].join(':');
    expect(resolveInstructionHref(scriptUrl, SOURCE)).toBeUndefined();
    expect(resolveInstructionHref('data:text/html,x', SOURCE)).toBeUndefined();
    expect(resolveInstructionHref(undefined, SOURCE)).toBeUndefined();
  });
});

describe('SkillInstructions', () => {
  it('renders GFM but drops raw HTML and turns images into links', async () => {
    await renderInTestApp(
      <SkillInstructions
        sourceUrl={SOURCE}
        markdown={[
          '# Triage',
          '',
          '| Step | Owner |',
          '| ---- | ----- |',
          '| Sort | Bot   |',
          '',
          '<img src="https://tracker.example.com/pixel.gif" />',
          '<a href="javascript:alert(1)">click</a>',
          '',
          '[bad](javascript:alert(1))',
          '',
          '![flow](img/flow.png)',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Triage' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    const root = screen.getByTestId('skill-instructions');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Image: flow/ })).toHaveAttribute(
      'href',
      `${SOURCE}/img/flow.png`,
    );
  });
});
