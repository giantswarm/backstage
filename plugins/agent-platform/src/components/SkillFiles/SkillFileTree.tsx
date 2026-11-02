import { useMemo } from 'react';
import { Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import FolderOutlinedIcon from '@material-ui/icons/FolderOutlined';
import InsertDriveFileOutlinedIcon from '@material-ui/icons/InsertDriveFileOutlined';

import { formatBytes } from '../../lib/formatNumbers';
import { groupSkillFiles, skillFileName } from '../../lib/skillFiles';
import type { SkillFile } from '../../lib/skills';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-2)',
    minWidth: 0,
  },
  // A plain scrolling list: at most 200 rows (the backend's cap), so no
  // windowing — a bounded height keeps a long listing from pushing the
  // viewer off screen.
  scroller: {
    overflowY: 'auto',
    minWidth: 0,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  dir: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-1)',
    padding: 'var(--bui-space-2) var(--bui-space-2) var(--bui-space-1)',
    color: 'var(--bui-fg-secondary)',
    fontSize: '0.8125rem',
    overflowWrap: 'anywhere',
  },
  file: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-1) var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    textDecoration: 'none',
    color: 'var(--bui-fg-primary)',
    minWidth: 0,
    '&:hover': {
      backgroundColor: 'var(--bui-bg-neutral-1)',
    },
    '&[aria-current="page"]': {
      backgroundColor: 'var(--bui-bg-neutral-2)',
      fontWeight: 600,
    },
  },
  nested: {
    paddingLeft: 'var(--bui-space-5)',
  },
  icon: {
    fontSize: 16,
    flexShrink: 0,
    color: 'var(--bui-fg-secondary)',
  },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  size: {
    flexShrink: 0,
    color: 'var(--bui-fg-secondary)',
    fontSize: '0.75rem',
    fontWeight: 400,
  },
});

export type SkillFileTreeProps = {
  /** The skill's listed files, SKILL.md first. */
  files: SkillFile[];
  /** The file the viewer shows. */
  selected: string;
  /** The page address that shows a file in the viewer. */
  hrefFor: (path: string) => string;
  /** The listing stopped at the backend's cap; the skill has more files. */
  truncated?: boolean;
  /** The scrolling list's height cap (CSS), e.g. `70vh`. */
  maxHeight: string;
};

/**
 * The skill's files as a tree: the skill directory's own files (SKILL.md
 * first), then each folder with its files, every file a link that shows it in
 * the viewer — the selected one marked `aria-current`. Each link's name is
 * the full path, so two `README.md`s in different folders stay apart for a
 * screen reader. A listing cut at the backend's cap says so, quietly.
 */
export function SkillFileTree({
  files,
  selected,
  hrefFor,
  truncated,
  maxHeight,
}: SkillFileTreeProps) {
  const classes = useStyles();
  const groups = useMemo(() => groupSkillFiles(files), [files]);

  return (
    <nav aria-label="Skill files" className={classes.root}>
      <div className={classes.scroller} style={{ maxHeight }}>
        <ul className={classes.list}>
          {groups.map(group => (
            <li key={group.dir || '.'}>
              {group.dir && (
                <div className={classes.dir}>
                  <FolderOutlinedIcon className={classes.icon} />
                  <span>{group.dir}/</span>
                </div>
              )}
              <ul className={classes.list}>
                {group.files.map(file => (
                  <li key={file.path}>
                    <Link
                      href={hrefFor(file.path)}
                      aria-label={file.path}
                      aria-current={file.path === selected ? 'page' : undefined}
                      variant="body-small"
                      className={`${classes.file} ${
                        group.dir ? classes.nested : ''
                      }`}
                    >
                      <InsertDriveFileOutlinedIcon className={classes.icon} />
                      <span className={classes.name} title={file.path}>
                        {skillFileName(file.path)}
                      </span>
                      <span className={classes.size}>
                        {formatBytes(file.size)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      {truncated && (
        <Text as="p" variant="body-small" color="secondary">
          Showing the first {files.length} files.
        </Text>
      )}
    </nav>
  );
}
