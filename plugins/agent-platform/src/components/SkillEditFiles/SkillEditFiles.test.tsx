import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import type { SkillFile } from '../../lib/skills';
import { SkillEditFiles } from './SkillEditFiles';
import { missingFileLinks } from './missingFileLinks';

const skill = {
  repoUrl: 'https://github.com/giantswarm/skills',
  path: 'support/ticket-triage',
  commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};
const SKILL_HREF =
  '/agent-platform/skills/giantswarm/skills/support/ticket-triage';

function file(path: string): SkillFile {
  return { path, size: 10, sha: path };
}

const files = [
  file('SKILL.md'),
  file('references/setup guide.md'),
  file('scripts/query.py'),
];

function renderFiles(
  props: Partial<React.ComponentProps<typeof SkillEditFiles>> = {},
) {
  return renderInTestApp(
    <SkillEditFiles
      skill={skill}
      skillHref={SKILL_HREF}
      instructions="Classify."
      files={files}
      {...props}
    />,
  );
}

describe('SkillEditFiles', () => {
  it('lists the other files, each opening the viewer, plus the folder on GitHub', async () => {
    await renderFiles();

    expect(
      screen.getByText('These 2 files stay as they are'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'references/setup guide.md' }),
    ).toHaveAttribute(
      'href',
      `${SKILL_HREF}/instructions?file=references/setup%20guide.md`,
    );
    expect(
      screen.getByRole('link', { name: 'scripts/query.py' }),
    ).toHaveAttribute(
      'href',
      `${SKILL_HREF}/instructions?file=scripts/query.py`,
    );
    expect(
      screen.queryByRole('link', { name: 'SKILL.md' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Edit on GitHub ↗' }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${skill.commit}/support/ticket-triage`,
    );
  });

  it('says "This file" for one, and "N+" for a cut listing', async () => {
    const { unmount } = await renderFiles({ files: files.slice(0, 2) });
    expect(screen.getByText('This file stays as it is')).toBeInTheDocument();
    unmount();

    await renderFiles({ filesTruncated: true });
    expect(
      screen.getByText('These 2+ files stay as they are'),
    ).toBeInTheDocument();
  });

  it('shows nothing for a single-file skill or an unknown list', async () => {
    const { container, unmount } = await renderFiles({
      files: [file('SKILL.md')],
    });
    expect(screen.queryByText(/stay as/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /GitHub/ }),
    ).not.toBeInTheDocument();
    unmount();

    await renderFiles({ files: undefined });
    expect(screen.queryByText(/stay as/)).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('folds a long list behind "Show all"', async () => {
    const many = [
      file('SKILL.md'),
      ...Array.from({ length: 30 }, (_, i) => file(`data/f${i}.csv`)),
    ];
    await renderFiles({ files: many });

    expect(
      screen.getByText('These 30 files stay as they are'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'data/f29.csv' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 30 files' }),
    );
    expect(
      screen.getByRole('link', { name: 'data/f29.csv' }),
    ).toBeInTheDocument();
  });

  it('flags links to files the skill does not have', async () => {
    await renderFiles({
      instructions:
        'See [setup](references/setup%20guide.md) and [the rest](references/gone.md).',
    });

    expect(
      screen.getByText(
        'The instructions link to files the skill does not have: references/gone.md',
      ),
    ).toBeInTheDocument();
  });

  it('does not flag when every link resolves, or when the listing was cut', async () => {
    const { unmount } = await renderFiles({
      instructions: 'See [setup](references/setup%20guide.md).',
    });
    expect(screen.queryByText(/does not have/)).not.toBeInTheDocument();
    unmount();

    await renderFiles({
      instructions: 'See [x](references/gone.md).',
      filesTruncated: true,
    });
    expect(screen.queryByText(/does not have/)).not.toBeInTheDocument();
  });
});

describe('missingFileLinks', () => {
  const listed = [
    file('SKILL.md'),
    file('references/a.md'),
    file('data/x.csv'),
  ];

  it('finds relative links and images to unlisted files, once each, in order', () => {
    expect(
      missingFileLinks(
        '[a](./references/a.md) [b](references/b.md#top) ![i](img/p.png) [b again](references/b.md)',
        listed,
      ),
    ).toEqual(['references/b.md', 'img/p.png']);
  });

  it('leaves URLs, anchors, folders, SKILL.md and paths outside the skill alone', () => {
    expect(
      missingFileLinks(
        '[u](https://example.com/x.md) [m](mailto:a@b.c) [h](#top) [d](data/) [s](SKILL.md) [o](../other.md) [r](/root.md)',
        listed,
      ),
    ).toEqual([]);
  });

  it('does not read code', () => {
    expect(
      missingFileLinks(
        'Write `[x](nope.md)` like so:\n\n```md\n[y](nope2.md)\n```\n\n~~~\n[z](nope3.md)\n~~~\n',
        listed,
      ),
    ).toEqual([]);
  });
});
