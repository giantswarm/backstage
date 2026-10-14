import { useMemo, type ReactNode } from 'react';
import { Alert, ButtonLink, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import { useSkillFile } from '../../hooks/useSkillFile';
import { formatBytes } from '../../lib/formatNumbers';
import {
  CSV_PREVIEW_COLUMNS,
  CSV_PREVIEW_ROWS,
  parseDelimited,
  SKILL_MD,
  skillFileDir,
  skillFileKind,
} from '../../lib/skillFiles';
import {
  shortCommit,
  skillFileUrl,
  skillSourceUrl,
  type DiscoveredSkill,
  type SkillFile,
} from '../../lib/skills';
import { useMarkdownStyles } from '../SessionTimeline/MessageMarkdown';
import { SkillInstructions, type SkillFileLinks } from '../SkillInstructions';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--bui-space-2)',
  },
  // Overrides of the chat's code block for a whole file: no outer margin,
  // a bounded height that scrolls, lines kept as written.
  text: {
    margin: 0,
    maxHeight: '70vh',
    overflow: 'auto',
    whiteSpace: 'pre',
  },
  tableScroller: {
    overflow: 'auto',
    maxHeight: '70vh',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-3)',
  },
  table: {
    borderCollapse: 'collapse',
    fontSize: '0.8125rem',
    '& th, & td': {
      padding: 'var(--bui-space-1) var(--bui-space-2)',
      borderBottom: '1px solid var(--bui-border-1)',
      textAlign: 'left',
      verticalAlign: 'top',
      whiteSpace: 'nowrap',
      maxWidth: '24rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    '& th': {
      position: 'sticky',
      top: 0,
      backgroundColor: 'var(--bui-bg-neutral-1)',
      fontWeight: 600,
    },
  },
});

/** "1,234" — the row counts under a CSV preview. */
const count = (value: number) => value.toLocaleString('en-US');

/**
 * A CSV (or TSV) file as a table: the header row, then the first
 * {@link CSV_PREVIEW_ROWS} rows and {@link CSV_PREVIEW_COLUMNS} columns — a
 * preview, not a spreadsheet; the line under it says what was left out.
 */
function CsvPreview({ path, text }: { path: string; text: string }) {
  const classes = useStyles();
  const rows = useMemo(
    () =>
      parseDelimited(text, path.toLowerCase().endsWith('.tsv') ? '\t' : ','),
    [path, text],
  );
  const [header = [], ...data] = rows;
  const columns = data.reduce(
    (widest, row) => Math.max(widest, row.length),
    header.length,
  );
  const shownColumns = Math.min(columns, CSV_PREVIEW_COLUMNS);
  const shown = data.slice(0, CSV_PREVIEW_ROWS);
  const cells = (row: string[]) =>
    Array.from({ length: shownColumns }, (_, i) => row[i] ?? '');

  const notes = [
    data.length > CSV_PREVIEW_ROWS
      ? `First ${count(CSV_PREVIEW_ROWS)} of ${count(data.length)} rows`
      : `${count(data.length)} ${data.length === 1 ? 'row' : 'rows'}`,
    ...(columns > CSV_PREVIEW_COLUMNS
      ? [`first ${CSV_PREVIEW_COLUMNS} of ${columns} columns`]
      : []),
  ];

  return (
    <Flex direction="column" gap="2">
      <div className={classes.tableScroller}>
        <table className={classes.table} aria-label={`Preview of ${path}`}>
          <thead>
            <tr>
              {cells(header).map((cell, i) => (
                <th key={i} scope="col" title={cell}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr key={r}>
                {cells(row).map((cell, i) => (
                  <td key={i} title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Text as="p" variant="body-small" color="secondary">
        {notes.join(', ')}.
      </Text>
    </Flex>
  );
}

/**
 * The repository's address for a folder of the skill at the pinned commit,
 * which a rendered file's relative links that leave the listing resolve
 * against (GitHub redirects `tree/` to `blob/` for a file).
 */
function folderSourceUrl(
  skill: DiscoveredSkill,
  path: string,
): string | undefined {
  const base = skillSourceUrl(skill);
  const dir = skillFileDir(path);
  return base && dir
    ? `${base}/${dir.split('/').map(encodeURIComponent).join('/')}`
    : base;
}

/** A file the portal does not show inline: why, and where it can be read. */
function NotShown({
  skill,
  file,
  reason,
}: {
  skill: DiscoveredSkill;
  file: SkillFile;
  reason: 'binary' | 'truncated';
}) {
  const url = skillFileUrl(skill, file.path);
  const why =
    reason === 'binary'
      ? 'This is a binary file, so the portal does not show it.'
      : `This file is ${formatBytes(
          file.size,
        )}, larger than the 512 KB the portal shows inline.`;
  return (
    <Flex direction="column" gap="3" align="start">
      <Text as="p" variant="body-medium" color="secondary">
        {why}
      </Text>
      {url ? (
        <ButtonLink
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
        >
          View on GitHub ↗
        </ButtonLink>
      ) : (
        <Text as="p" variant="body-small" color="secondary">
          {file.path} · {formatBytes(file.size)} — in the skill’s repository at{' '}
          {shortCommit(skill.commit)}.
        </Text>
      )}
    </Flex>
  );
}

/** A listed file's text, shown by its kind. */
function TextBody({
  skill,
  path,
  text,
  fileLinks,
}: {
  skill: DiscoveredSkill;
  path: string;
  text: string;
  fileLinks: SkillFileLinks;
}) {
  const classes = useStyles();
  const markdownClasses = useMarkdownStyles();
  const links = useMemo(
    () => ({ ...fileLinks, from: path }),
    [fileLinks, path],
  );

  if (!text.trim()) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        This file is empty.
      </Text>
    );
  }
  const kind = skillFileKind(path);
  if (kind === 'markdown') {
    return (
      <SkillInstructions
        markdown={text}
        sourceUrl={folderSourceUrl(skill, path)}
        fileLinks={links}
      />
    );
  }
  if (kind === 'csv') {
    return <CsvPreview path={path} text={text} />;
  }
  return (
    <pre
      className={`${markdownClasses.codeBlock} ${classes.text}`}
      aria-label={`Contents of ${path}`}
    >
      <code>{text}</code>
    </pre>
  );
}

export type SkillFileViewerProps = {
  skill: DiscoveredSkill;
  /** The listed file to show. */
  file: SkillFile;
  /** The commit the content was read at. */
  commit: string;
  /** SKILL.md's body (already read with the listing). */
  instructions: string;
  /** The skill's files, which links in a rendered file open here. */
  fileLinks: SkillFileLinks;
};

/**
 * One file of the skill, as the Instructions tab shows it beside the tree:
 *
 * - **SKILL.md** — its body, rendered as today (no extra read);
 * - **Markdown** (`.md`, `.markdown`, `.mdc`, `.mdx`) — rendered through the
 *   same sanitising renderer (`SkillInstructions`), its links to other files
 *   of the skill opening them here;
 * - **CSV/TSV** — a capped table preview;
 * - **any other text** (code, YAML, JSON, scripts) — monospace, as written;
 *   shown, never run;
 * - **binary or over 512 KB** — no content; "View on GitHub" at the pinned
 *   commit, or for a repository outside github.com the path and size.
 *
 * A line above names the file, the commit and the size; for a file shown
 * inline on github.com, it links to the file there too.
 */
export function SkillFileViewer({
  skill,
  file,
  commit,
  instructions,
  fileLinks,
}: SkillFileViewerProps) {
  const classes = useStyles();
  const isSkillMd = file.path === SKILL_MD;
  // SKILL.md came with the listing; every other file is one read, by path.
  const {
    file: read,
    isLoading,
    error,
  } = useSkillFile(skill, isSkillMd ? undefined : file.path);
  const repoPath = skill.path ? `${skill.path}/${file.path}` : file.path;
  const url = skillFileUrl(skill, file.path);
  const notShown =
    read && (read.binary || read.truncated || read.content === undefined);

  let body: ReactNode;
  if (isSkillMd) {
    body = instructions.trim() ? (
      <SkillInstructions
        markdown={instructions}
        sourceUrl={skillSourceUrl(skill)}
        fileLinks={fileLinks}
      />
    ) : (
      <Text as="p" variant="body-medium" color="secondary">
        The SKILL.md has no instructions under its frontmatter.
      </Text>
    );
  } else if (isLoading) {
    body = <LoadingIndicator label={`Reading ${file.path}…`} />;
  } else if (error || !read) {
    body = (
      <Alert
        status="danger"
        title={`Could not read ${file.path}`}
        description={error?.message ?? 'The file could not be read right now.'}
      />
    );
  } else if (notShown) {
    body = (
      <NotShown
        skill={skill}
        file={{ ...file, size: read.size }}
        reason={read.binary ? 'binary' : 'truncated'}
      />
    );
  } else {
    body = (
      <TextBody
        skill={skill}
        path={file.path}
        text={read.content ?? ''}
        fileLinks={fileLinks}
      />
    );
  }

  return (
    <section aria-label={file.path}>
      <Flex direction="column" gap="3">
        <div className={classes.header}>
          <Text as="p" variant="body-small" color="secondary">
            {repoPath} at {shortCommit(commit)} · {formatBytes(file.size)}
          </Text>
          {/* Not shown inline: the body offers the link instead. */}
          {url && !notShown && (
            <Link
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              variant="body-small"
            >
              View on GitHub ↗
            </Link>
          )}
        </div>
        {body}
      </Flex>
    </section>
  );
}
