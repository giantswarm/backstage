import { Action, Installation } from '../apis';

/** A piece of a message: text, linked where the manager named something on GitHub. */
export interface Part {
  text: string;
  href?: string;
}

/** A path with a directory in it, or a file by an extension the filesets carry. */
const FILE = /^[\w.@+-]+(\/[\w.@+-]+)+$|\.(ya?ml|patch|json|md)$/i;
const WEB_URL = /^https?:\/\/\S+$/;
/** The punctuation a sentence hangs on a word: kept as text around the link. */
const LEADING = /^[(["']+/;
const TRAILING = /[)\]"',;:.]+$/;

/**
 * The repositories a message of this action may name: the installation's
 * on record and the ones its pull requests were opened in.
 */
export function repositoriesOf(
  installation: Pick<Installation, 'repositories'>,
  action: Action,
): string[] {
  const named = [
    installation.repositories?.configs,
    installation.repositories?.managementClusters,
    ...(action.status?.pullRequests ?? []).map(pr => pr.repository),
  ];
  return [...new Set(named.filter((r): r is string => !!r))];
}

/**
 * The message split into words, with what it names on GitHub linked: a
 * repository of `repositories` to its page, a URL to itself, and a file to
 * its blob on the default branch of the repository the sentence names after
 * it (`<path> in <repo>`, `<path> is gone from the default branch of
 * <repo>`) -- or of the one repository the message names anywhere, where it
 * names one. A file in a message that names no repository stays text: the
 * manager's word, unlinked, rather than a guess. The punctuation around a
 * word stays text.
 */
export function linkify(message: string, repositories: string[]): Part[] {
  const tokens = message.split(/(\s+)/);
  const cores = tokens.map(t => t.replace(LEADING, '').replace(TRAILING, ''));
  const isRepository = (core: string) => repositories.includes(core);
  const named = cores.filter(isRepository);
  const only = new Set(named).size === 1 ? named[0] : undefined;
  const repositoryFor = (index: number) =>
    cores.slice(index + 1).find(isRepository) ?? only;

  const parts: Part[] = [];
  const text = (t: string) => {
    if (!t) {
      return;
    }
    const last = parts[parts.length - 1];
    if (last && !last.href) {
      last.text += t;
    } else {
      parts.push({ text: t });
    }
  };
  tokens.forEach((token, index) => {
    const core = cores[index];
    let href: string | undefined;
    if (isRepository(core)) {
      href = `https://github.com/${core}`;
    } else if (WEB_URL.test(core)) {
      href = core;
    } else if (FILE.test(core)) {
      const repository = repositoryFor(index);
      href = repository && `https://github.com/${repository}/blob/HEAD/${core}`;
    }
    if (!href) {
      text(token);
      return;
    }
    const start = token.indexOf(core);
    text(token.slice(0, start));
    parts.push({ text: core, href });
    text(token.slice(start + core.length));
  });
  return parts;
}
