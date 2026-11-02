import { resolveSkillFilePath, SKILL_MD } from '../../lib/skillFiles';

/**
 * The skill files that Markdown links and images in `instructions` point at
 * but the skill does not have: relative references that resolve inside the
 * skill directory to something neither listed nor a folder of listed files.
 * Fenced code and inline code are not read (they show links, not make them);
 * references outside the skill, URLs and in-page anchors are not file
 * references here. In order of first mention, each once.
 */
export function missingFileLinks(
  instructions: string,
  files: ReadonlyArray<{ path: string }>,
): string[] {
  const paths = new Set(files.map(file => file.path));
  const prose = instructions
    .replace(
      /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[`~]*[ \t]*(?:\n|$)|$)/gm,
      '\n',
    )
    .replace(/`[^`\n]*`/g, '');
  const missing: string[] = [];
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?/g)) {
    const target = resolveSkillFilePath(match[1]);
    if (
      !target ||
      target === SKILL_MD ||
      paths.has(target) ||
      files.some(file => file.path.startsWith(`${target}/`)) ||
      missing.includes(target)
    ) {
      continue;
    }
    missing.push(target);
  }
  return missing;
}
