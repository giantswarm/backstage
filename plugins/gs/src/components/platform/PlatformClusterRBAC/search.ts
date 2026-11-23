import type {
  RbacBindingInfo,
  RbacSubjectRow,
} from '../../clusters/cluster-details/ClusterRBAC/utils';

/** What the classic table shows for a subject: a service account with its namespace. */
export function subjectName(row: RbacSubjectRow): string {
  return row.namespace ? `${row.namespace}/${row.name}` : row.name;
}

/** The query as it is matched: trimmed, in lower case; empty matches everything. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function contains(text: string | undefined, needle: string): boolean {
  return text !== undefined && text.toLowerCase().includes(needle);
}

/** How a subject matches a search. */
export type RbacRowMatch = {
  /** It matches by what its row shows: the subject, kind, roles or scope. */
  visible: boolean;
  /** The bindings whose name or namespace matches, shown when the row opens. */
  bindings: ReadonlySet<RbacBindingInfo>;
};

const EVERYTHING: RbacRowMatch = { visible: true, bindings: new Set() };

/**
 * Whether a subject matches a search, a case-insensitive substring of what
 * its row shows (the subject with its namespace, its kind, its roles, its
 * access scope) or of what its opened row shows: its bindings' names and
 * namespaces. Undefined where it does not match.
 */
export function matchRow(
  row: RbacSubjectRow,
  query: string,
): RbacRowMatch | undefined {
  const needle = normalizeQuery(query);
  if (!needle) {
    return EVERYTHING;
  }
  const visible =
    contains(subjectName(row), needle) ||
    contains(row.kind, needle) ||
    row.roles.some(role => contains(role, needle)) ||
    contains(row.scopeText, needle);
  const bindings = new Set(
    row.bindings.filter(
      binding =>
        contains(binding.bindingName, needle) ||
        contains(binding.namespace, needle),
    ),
  );
  return visible || bindings.size > 0 ? { visible, bindings } : undefined;
}

/** A piece of text, with whether it is an occurrence of the query. */
export type TextPart = { text: string; isMatch: boolean };

/** `text` cut at each case-insensitive occurrence of the query. */
export function splitByQuery(text: string, query: string): TextPart[] {
  const needle = normalizeQuery(query);
  if (!needle) {
    return [{ text, isMatch: false }];
  }
  const parts: TextPart[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (
    let at = lower.indexOf(needle);
    at !== -1;
    at = lower.indexOf(needle, from)
  ) {
    if (at > from) {
      parts.push({ text: text.slice(from, at), isMatch: false });
    }
    parts.push({ text: text.slice(at, at + needle.length), isMatch: true });
    from = at + needle.length;
  }
  if (from < text.length) {
    parts.push({ text: text.slice(from), isMatch: false });
  }
  return parts;
}
