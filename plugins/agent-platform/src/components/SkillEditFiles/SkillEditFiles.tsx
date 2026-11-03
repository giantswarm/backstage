import { Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { ShowMore, USED_BY_ROWS } from '@giantswarm/backstage-plugin-ui-react';

import { SKILL_MD } from '../../lib/skillFiles';
import {
  skillSourceUrl,
  type DiscoveredSkill,
  type SkillFileListing,
} from '../../lib/skills';
import { SKILL_FILE_PARAM } from '../SkillFiles';
import { missingFileLinks } from './missingFileLinks';

const useStyles = makeStyles({
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1) var(--bui-space-3)',
  },
  path: {
    overflowWrap: 'anywhere',
  },
});

export type SkillEditFilesProps = SkillFileListing & {
  skill: Pick<DiscoveredSkill, 'repoUrl' | 'path' | 'commit'>;
  /** The skill's detail page, whose Instructions tab views a file. */
  skillHref: string;
  /** The instructions as typed now, checked for links to missing files. */
  instructions: string;
};

/**
 * The edit form's read-only note on the rest of the skill: the files next to
 * its SKILL.md stay as they are, each one linked to the detail page's viewer
 * (in a new tab, so the form keeps what was typed), plus the skill's folder
 * on GitHub to change them there. Nothing for a skill with only a SKILL.md or
 * whose files could not be listed. Quietly flags links in the instructions
 * to files the skill does not have — unless the listing was cut at the
 * backend's cap, when the file may merely be past it.
 */
export function SkillEditFiles({
  skill,
  skillHref,
  instructions,
  files,
  filesTruncated,
}: SkillEditFilesProps) {
  const classes = useStyles();
  const others = (files ?? []).filter(file => file.path !== SKILL_MD);
  if (others.length === 0) {
    return null;
  }
  const missing = filesTruncated ? [] : missingFileLinks(instructions, files!);
  const githubUrl = skillSourceUrl(skill);
  const count = `${others.length}${filesTruncated ? '+' : ''}`;

  return (
    <Flex direction="column" gap="2">
      <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
        <Text as="p" variant="body-medium" weight="bold">
          {others.length === 1 && !filesTruncated
            ? 'This file stays as it is'
            : `These ${count} files stay as they are`}
        </Text>
        {githubUrl && (
          <Link
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="body-small"
          >
            Edit on GitHub ↗
          </Link>
        )}
      </Flex>
      <ShowMore items={others} initial={USED_BY_ROWS} noun="file" revealAll>
        {shown => (
          <ul className={classes.list} aria-label="Files that stay as they are">
            {shown.map(file => (
              <li key={file.path} className={classes.path}>
                <Link
                  href={`${skillHref}/instructions?${SKILL_FILE_PARAM}=${encodeURIComponent(
                    file.path,
                  ).replace(/%2F/g, '/')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body-small"
                >
                  {file.path}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ShowMore>
      {missing.length > 0 && (
        <Text as="p" variant="body-small" color="warning">
          The instructions link to files the skill does not have:{' '}
          {missing.join(', ')}
        </Text>
      )}
    </Flex>
  );
}
