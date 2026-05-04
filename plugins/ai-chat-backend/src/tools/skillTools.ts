import {
  LoggerService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { tool } from 'ai';
import { z } from 'zod/v3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const BUNDLED_SKILLS_DIR = resolvePackagePath(
  '@giantswarm/backstage-plugin-ai-chat-backend',
  'skills',
);

function loadSkillsFromDir(
  dir: string,
  logger: LoggerService,
): Map<string, string> {
  const skills = new Map<string, string>();

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    logger.warn(
      `aiChat.skills.dir "${dir}" could not be read: ${(err as Error).message}`,
    );
    return skills;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(dir, entry);
    try {
      if (!statSync(filePath).isFile()) continue;
      const name = basename(entry, '.md');
      skills.set(name, readFileSync(filePath, 'utf-8').trim());
    } catch (err) {
      logger.warn(
        `Failed to load skill from "${filePath}": ${(err as Error).message}`,
      );
    }
  }

  return skills;
}

function resolveSkills(
  config: Config,
  logger: LoggerService,
): Map<string, string> {
  const skills = new Map<string, string>();

  const useBundled = config.getOptionalBoolean('aiChat.skills.bundled') ?? true;
  if (useBundled) {
    for (const [name, content] of loadSkillsFromDir(
      BUNDLED_SKILLS_DIR,
      logger,
    )) {
      skills.set(name, content);
    }
  }

  const dir = config.getOptionalString('aiChat.skills.dir');
  if (dir) {
    for (const [name, content] of loadSkillsFromDir(dir, logger)) {
      skills.set(name, content);
    }
  }

  const inline = config.getOptionalConfigArray('aiChat.skills.inline') ?? [];
  for (const entry of inline) {
    const name = entry.getString('name');
    const content = entry.getString('content');
    skills.set(name, content.trim());
  }

  return skills;
}

export function createSkillTools(config: Config, logger: LoggerService) {
  const skills = resolveSkills(config, logger);
  const validTopics = Array.from(skills.keys());

  if (validTopics.length === 0) {
    logger.info(
      'No AI chat skills configured; listSkills/getSkill tools are disabled.',
    );
    return {};
  }

  logger.info(
    `Loaded ${validTopics.length} AI chat skill(s): ${validTopics.join(', ')}`,
  );

  const listSkills = tool({
    description:
      'Lists all topics that have expert knowledge available. Call this first to see what expert knowledge can be queried.',
    inputSchema: z.object({}),
    execute: async () => ({
      availableTopics: validTopics,
      hint: 'Use getSkill with one of these topics to learn the expert knowledge.',
    }),
  });

  const getSkill = tool({
    description:
      'Retrieves expert knowledge about a specific topic. Only works for known topics. Use listSkills first if unsure what topics are available.',
    inputSchema: z.object({
      topic: z.string().describe('The topic to get expert knowledge about'),
    }),
    execute: async ({ topic }) => {
      const content = skills.get(topic);
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

  return { listSkills, getSkill };
}
