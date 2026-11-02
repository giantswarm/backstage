import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import {
  SimpleAccordion,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { SKILL_MD } from '../../lib/skillFiles';
import type { DiscoveredSkill, SkillFile } from '../../lib/skills';
import type { SkillFileLinks } from '../SkillInstructions';
import { SkillFileTree } from './SkillFileTree';
import { SkillFileViewer } from './SkillFileViewer';

/** The search parameter naming the file the viewer shows. */
export const SKILL_FILE_PARAM = 'file';

const useStyles = makeStyles({
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)',
    gap: 'var(--bui-space-6)',
    alignItems: 'start',
  },
  tree: {
    position: 'sticky',
    top: 'var(--bui-space-4)',
    paddingRight: 'var(--bui-space-3)',
    borderRight: '1px solid var(--bui-border-1)',
    minWidth: 0,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-4)',
    minWidth: 0,
  },
  viewer: {
    minWidth: 0,
    scrollMarginTop: 'var(--bui-space-4)',
  },
});

/** `references/x.md` → `references/x.md` in a query string, slashes kept. */
function encodeFileParam(path: string): string {
  return encodeURIComponent(path).replace(/%2F/g, '/');
}

export type SkillFilesProps = {
  skill: DiscoveredSkill;
  /** The commit the listing and SKILL.md were read at. */
  commit: string;
  /** SKILL.md's body, read with the listing. */
  instructions: string;
  /** The skill's files, SKILL.md first (more than SKILL.md alone). */
  files: SkillFile[];
  /** The listing stopped at the backend's cap. */
  filesTruncated?: boolean;
};

/**
 * A multi-file skill on its Instructions tab: the tree of its files beside a
 * viewer showing one of them — SKILL.md until another is picked. The rest of
 * a skill is instruction context too (references read on demand, scripts the
 * agent runs, data they read), so it sits in the same tab, not a separate one.
 *
 * The shown file is part of the address (`?file=references/x.md`), so a file
 * can be linked to and the browser's Back returns to the one before; links
 * and backticked paths in a rendered file that name another file of the skill
 * open it here the same way. A `file` the listing does not name shows
 * SKILL.md.
 *
 * Desktop: the tree in a column at the left, sticky while the file scrolls.
 * Phone: stacked — the tree folded into a "Files (N)" disclosure above the
 * viewer, folding again once a file is picked so the file is what shows.
 */
export function SkillFiles({
  skill,
  commit,
  instructions,
  files,
  filesTruncated,
}: SkillFilesProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const { pathname, search } = useLocation();
  const viewerRef = useRef<HTMLDivElement>(null);

  const paths = useMemo(() => new Set(files.map(file => file.path)), [files]);
  const requested = new URLSearchParams(search).get(SKILL_FILE_PARAM);
  const selected =
    requested && paths.has(requested)
      ? files.find(file => file.path === requested)!
      : (files.find(file => file.path === SKILL_MD) ?? files[0]);

  const hrefFor = useCallback(
    (path: string) =>
      path === SKILL_MD
        ? pathname
        : `${pathname}?${SKILL_FILE_PARAM}=${encodeFileParam(path)}`,
    [pathname],
  );
  const fileLinks = useMemo<SkillFileLinks>(
    () => ({ paths, hrefFor }),
    [paths, hrefFor],
  );

  // A file opened from a link deep in a long document would otherwise show
  // with the page still scrolled far below its top.
  const shown = useRef(selected.path);
  useEffect(() => {
    if (shown.current === selected.path) {
      return;
    }
    shown.current = selected.path;
    const viewer = viewerRef.current;
    if (viewer && viewer.getBoundingClientRect().top < 0) {
      viewer.scrollIntoView?.({ block: 'start' });
    }
  }, [selected.path]);

  const viewer = (
    <div ref={viewerRef} className={classes.viewer}>
      <SkillFileViewer
        skill={skill}
        file={selected}
        commit={commit}
        instructions={instructions}
        fileLinks={fileLinks}
      />
    </div>
  );

  if (isPhone) {
    return (
      <div className={classes.stack}>
        <SimpleAccordion
          // Remounted, so folded, whenever the shown file changes.
          key={selected.path}
          title={`Files (${files.length}${filesTruncated ? '+' : ''})`}
        >
          <SkillFileTree
            files={files}
            selected={selected.path}
            hrefFor={hrefFor}
            truncated={filesTruncated}
            maxHeight="50vh"
          />
        </SimpleAccordion>
        {viewer}
      </div>
    );
  }

  return (
    <div className={classes.split}>
      <div className={classes.tree}>
        <SkillFileTree
          files={files}
          selected={selected.path}
          hrefFor={hrefFor}
          truncated={filesTruncated}
          maxHeight="calc(100vh - 12rem)"
        />
      </div>
      {viewer}
    </div>
  );
}
