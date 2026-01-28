import { resolvePackagePath } from '@backstage/backend-plugin-api';
import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

// Load skills from markdown files in the skills directory
const skillsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'skills',
);

function loadSkills(): Record<string, string> {
  const skills: Record<string, string> = {};
  const files = readdirSync(skillsDir);

  for (const file of files) {
    if (file.endsWith('.md')) {
      const skillName = basename(file, '.md');
      const filePath = join(skillsDir, file);
      skills[skillName] = readFileSync(filePath, 'utf-8').trim();
    }
  }

  return skills;
}

const skills = loadSkills();
const validTopics = Object.keys(skills);

export const listSkills = tool({
  description:
    'Lists all topics that have expert knowledge available. Call this first to see what expert knowledge can be queried.',
  inputSchema: z.object({}),
  execute: async () => {
    return {
      availableTopics: validTopics,
      hint: 'Use getSkill with one of these topics to learn the expert knowledge.',
    };
  },
});

export const getSkill = tool({
  description:
    'Retrieves expert knowledge about a specific topic. Only works for known topics. Use listSkills first if unsure what topics are available.',
  inputSchema: z.object({
    topic: z
      .enum(validTopics as [string, ...string[]])
      .describe('The topic to get expert knowledge about'),
  }),
  execute: async ({ topic }) => {
    const content = skills[topic];
    if (!content) {
      return {
        error: `Unknown topic: ${topic}`,
        availableTopics: validTopics,
      };
    }
    return {
      topic,
      content,
    };
  },
});
