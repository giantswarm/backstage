import { Route, Routes, useLocation } from 'react-router-dom';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import type { SkillFile, SkillFileContent } from '../../lib/skills';
import { SkillFiles } from './SkillFiles';

const COMMIT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const PAGE = '/skills/giantswarm/skills/ticket-triage/instructions';

const skill = {
  name: 'Ticket triage',
  description: 'How to triage.',
  repoUrl: 'https://github.com/giantswarm/skills',
  path: 'ticket-triage',
  ref: 'main',
  commit: COMMIT,
};

const gitSkill = {
  ...skill,
  repoUrl: 'https://gitea.lab.local/lab/skills',
};

let mockReads: Record<string, Partial<SkillFileContent> | Error> = {};
const mockUseSkillFile = jest.fn();
jest.mock('../../hooks/useSkillFile', () => ({
  useSkillFile: (target: unknown, path: string | undefined) => {
    mockUseSkillFile(target, path);
    if (!path) {
      return { file: undefined, isLoading: false, error: null };
    }
    const read = mockReads[path];
    if (read instanceof Error) {
      return { file: undefined, isLoading: false, error: read };
    }
    return {
      file: read
        ? { path, size: 10, sha: 'x', binary: false, truncated: false, ...read }
        : undefined,
      isLoading: !read,
      error: null,
    };
  },
}));

const file = (path: string, size = 100): SkillFile => ({
  path,
  size,
  sha: `sha-${path}`,
});

const FILES = [
  file('SKILL.md', 2048),
  file('data/tickets.csv', 9000),
  file('images/flow.png', 30_000),
  file('references/setup.md', 600),
  file('scripts/query.py', 300),
];

const INSTRUCTIONS = [
  '# Triage',
  '',
  'Read [the setup](references/setup.md) first, then run `scripts/query.py`.',
  'The [other skill](../other-skill/SKILL.md) helps too.',
  'Run `python3 scripts/query.py` to search.',
].join('\n');

function LocationProbe() {
  const { search } = useLocation();
  return <div data-testid="search">{search}</div>;
}

type RenderOptions = {
  files?: SkillFile[];
  filesTruncated?: boolean;
  target?: typeof skill;
  at?: string;
};

function renderFiles({
  files = FILES,
  filesTruncated,
  target = skill,
  at = PAGE,
}: RenderOptions = {}) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/skills/*"
        element={
          <>
            <SkillFiles
              skill={target}
              commit={COMMIT}
              instructions={INSTRUCTIONS}
              files={files}
              filesTruncated={filesTruncated}
            />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { initialRouteEntries: [at] },
  );
}

const tree = () => screen.getByRole('navigation', { name: 'Skill files' });
const viewer = (path: string) => screen.getByRole('region', { name: path });

let layout: MockedLayout;
beforeEach(() => {
  mockReads = {};
  mockUseSkillFile.mockReset();
  layout = mockDesktopLayout();
});
afterEach(() => layout.restore());

describe('SkillFiles', () => {
  it('lists the files, SKILL.md first, and shows SKILL.md to begin with', async () => {
    await renderFiles();

    const links = within(tree()).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'SKILL.md',
      'data/tickets.csv',
      'images/flow.png',
      'references/setup.md',
      'scripts/query.py',
    ]);
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(within(tree()).getByText('references/')).toBeInTheDocument();
    expect(
      within(viewer('SKILL.md')).getByRole('heading', { name: 'Triage' }),
    ).toBeInTheDocument();
    expect(
      within(viewer('SKILL.md')).getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          element.textContent === 'ticket-triage/SKILL.md at a1b2c3d · 2.0 KiB',
      ),
    ).toBeInTheDocument();
    // SKILL.md came with the listing: no file read.
    expect(mockUseSkillFile).toHaveBeenLastCalledWith(skill, undefined);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('opens a picked file in the viewer, as part of the address', async () => {
    mockReads['references/setup.md'] = {
      content: '## Setup\n\nInstall it. Back to [the skill](../SKILL.md).',
    };
    await renderFiles();

    await userEvent.click(
      within(tree()).getByRole('link', { name: 'references/setup.md' }),
    );

    expect(screen.getByTestId('search')).toHaveTextContent(
      '?file=references/setup.md',
    );
    expect(mockUseSkillFile).toHaveBeenLastCalledWith(
      skill,
      'references/setup.md',
    );
    const shown = viewer('references/setup.md');
    // Markdown is rendered, not shown as source.
    expect(
      within(shown).getByRole('heading', { name: 'Setup' }),
    ).toBeInTheDocument();
    expect(
      within(tree()).getByRole('link', { name: 'references/setup.md' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(shown).getByRole('link', { name: /View on GitHub/ }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/blob/${COMMIT}/ticket-triage/references/setup.md`,
    );

    // A relative link back resolves against the file's own folder.
    await userEvent.click(
      within(shown).getByRole('link', { name: 'the skill' }),
    );
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    expect(viewer('SKILL.md')).toBeInTheDocument();
  });

  it('opens a file linked from SKILL.md in the viewer, and a backticked path too', async () => {
    mockReads['references/setup.md'] = { content: 'Setup.' };
    mockReads['scripts/query.py'] = { content: 'print("hi")\n' };
    await renderFiles();
    const skillMd = viewer('SKILL.md');

    // Outside the skill: still the repository.
    expect(
      within(skillMd).getByRole('link', { name: /other skill/ }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${COMMIT}/other-skill/SKILL.md`,
    );
    // Code that only mentions a path stays code.
    expect(
      within(skillMd).queryByRole('link', { name: 'python3 scripts/query.py' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(skillMd).getByRole('link', { name: 'the setup' }),
    );
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?file=references/setup.md',
    );
    expect(viewer('references/setup.md')).toHaveTextContent('Setup.');

    await userEvent.click(
      within(tree()).getByRole('link', { name: 'SKILL.md' }),
    );
    await userEvent.click(
      within(viewer('SKILL.md')).getByRole('link', {
        name: 'scripts/query.py',
      }),
    );
    // Code is shown as written, in monospace.
    expect(
      screen.getByLabelText('Contents of scripts/query.py'),
    ).toHaveTextContent('print("hi")');
  });

  it('previews a CSV as a capped table', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => `${i},ticket ${i}`);
    mockReads['data/tickets.csv'] = {
      content: ['id,title', ...rows].join('\n'),
    };
    await renderFiles({ at: `${PAGE}?file=data/tickets.csv` });

    const table = screen.getByRole('table', {
      name: 'Preview of data/tickets.csv',
    });
    expect(
      within(table).getByRole('columnheader', { name: 'title' }),
    ).toBeInTheDocument();
    // The header row plus 50 rows.
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(within(table).getByText('ticket 49')).toBeInTheDocument();
    expect(within(table).queryByText('ticket 50')).not.toBeInTheDocument();
    expect(screen.getByText('First 50 of 60 rows.')).toBeInTheDocument();
  });

  it('links a binary file to GitHub instead of showing it', async () => {
    mockReads['images/flow.png'] = { binary: true, size: 30_000 };
    await renderFiles({ at: `${PAGE}?file=images/flow.png` });

    const shown = viewer('images/flow.png');
    expect(
      within(shown).getByText(/binary file, so the portal does not show it/),
    ).toBeInTheDocument();
    const links = within(shown).getAllByRole('link', {
      name: /View on GitHub/,
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/blob/${COMMIT}/ticket-triage/images/flow.png`,
    );
  });

  it('links an oversize file to GitHub, and says its size', async () => {
    mockReads['data/tickets.csv'] = { truncated: true, size: 700 * 1024 };
    await renderFiles({ at: `${PAGE}?file=data/tickets.csv` });

    const shown = viewer('data/tickets.csv');
    expect(
      within(shown).getByText(/700 KiB, larger than the 512 KB/),
    ).toBeInTheDocument();
    expect(
      within(shown).getByRole('link', { name: /View on GitHub/ }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/blob/${COMMIT}/ticket-triage/data/tickets.csv`,
    );
  });

  it('names the path and size of a binary file in a repository outside github.com', async () => {
    mockReads['images/flow.png'] = { binary: true, size: 30_000 };
    await renderFiles({ target: gitSkill, at: `${PAGE}?file=images/flow.png` });

    const shown = viewer('images/flow.png');
    expect(
      within(shown).queryByRole('link', { name: /GitHub/ }),
    ).not.toBeInTheDocument();
    expect(
      within(shown).getByText(/images\/flow\.png · 29\.3 KiB — in the skill/),
    ).toBeInTheDocument();
  });

  it('says so when a file could not be read', async () => {
    mockReads['scripts/query.py'] = new Error('Upstream said 502.');
    await renderFiles({ at: `${PAGE}?file=scripts/query.py` });

    expect(
      screen.getByText('Could not read scripts/query.py'),
    ).toBeInTheDocument();
    expect(screen.getByText('Upstream said 502.')).toBeInTheDocument();
  });

  it('shows SKILL.md for a file the listing does not name', async () => {
    await renderFiles({ at: `${PAGE}?file=../../etc/passwd` });

    expect(viewer('SKILL.md')).toBeInTheDocument();
    expect(mockUseSkillFile).not.toHaveBeenCalledWith(
      skill,
      '../../etc/passwd',
    );
  });

  it('notes a listing cut at the cap', async () => {
    await renderFiles({ filesTruncated: true });

    expect(
      within(tree()).getByText('Showing the first 5 files.'),
    ).toBeInTheDocument();
  });

  it('holds 200 files, and opens the last one', async () => {
    const many = [
      file('SKILL.md'),
      ...Array.from({ length: 199 }, (_, i) =>
        file(`references/note-${String(i).padStart(3, '0')}.md`),
      ),
    ];
    mockReads['references/note-198.md'] = { content: 'The last note.' };
    await renderFiles({ files: many, filesTruncated: true });

    expect(within(tree()).getAllByRole('link')).toHaveLength(200);
    expect(
      within(tree()).getByText('Showing the first 200 files.'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(tree()).getByRole('link', { name: 'references/note-198.md' }),
    );
    expect(viewer('references/note-198.md')).toHaveTextContent(
      'The last note.',
    );
  }, 30_000);

  describe('at phone width', () => {
    beforeEach(() => {
      layout.restore();
      layout = mockPhoneLayout();
    });

    it('stacks a folded file list above the viewer, folding it again once a file is picked', async () => {
      mockReads['scripts/query.py'] = { content: 'print(1)' };
      await renderFiles();

      const toggle = screen.getByRole('button', { name: 'Files (5)' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(viewer('SKILL.md')).toBeInTheDocument();

      await userEvent.click(toggle);
      await userEvent.click(
        within(tree()).getByRole('link', { name: 'scripts/query.py' }),
      );

      expect(screen.getByRole('button', { name: 'Files (5)' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(
        screen.getByLabelText('Contents of scripts/query.py'),
      ).toHaveTextContent('print(1)');
    });

    it('becomes the side-by-side layout when the window widens', async () => {
      await renderFiles();
      expect(
        screen.getByRole('button', { name: 'Files (5)' }),
      ).toBeInTheDocument();

      act(() => layout.setWidth(1280));

      expect(
        screen.queryByRole('button', { name: 'Files (5)' }),
      ).not.toBeInTheDocument();
      expect(tree()).toBeVisible();
    });
  });
});
