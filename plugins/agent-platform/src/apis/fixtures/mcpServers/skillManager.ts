// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  SKILL_MANAGER_SERVER,
  type SkillManagerListing,
  type SkillManagerTool,
} from '../../../lib/skillManager';

const LIST_SKILLS: SkillManagerTool = 'list_skills';

/** skill-manager's tools in fixture mode: no skill repositories. */
export const skillManager: FixtureMcpServer = {
  server: SKILL_MANAGER_SERVER,
  tools: {
    [LIST_SKILLS]: (): SkillManagerListing => ({ repositories: [] }),
  },
};
