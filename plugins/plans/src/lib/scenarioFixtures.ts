/**
 * Names and titles for the Plans fixtures' scenarios (`many`,
 * `long-names`): made of plant words, so none is a real person, customer,
 * installation or repository, and the same on every run.
 */

const WORDS = [
  'alder',
  'aster',
  'basil',
  'birch',
  'bluebell',
  'bramble',
  'burdock',
  'campion',
  'cedar',
  'chicory',
  'clover',
  'fern',
  'foxglove',
  'hazel',
  'heather',
  'ivy',
  'juniper',
  'larch',
  'laurel',
  'lichen',
  'linden',
  'mallow',
  'moss',
  'nettle',
  'poppy',
  'primrose',
  'reed',
  'rowan',
  'sage',
  'sedge',
  'sorrel',
  'tansy',
  'teasel',
  'thistle',
  'thyme',
  'vetch',
  'willow',
  'woodruff',
  'yarrow',
] as const;

/**
 * The longest values the real data allows, which `long-names` serves:
 * GitHub's limits for titles (issues, pull requests) and logins, and git's
 * for one segment of a path (a plan's folder, a document's or a branch's
 * name). Names without a limit of their own (a person's, a customer's) get
 * {@link LONG_PERSON}.
 */
export const LONG_TITLE = 256;
export const LONG_LOGIN = 39;
export const LONG_SEGMENT = 255;
export const LONG_PERSON = 80;

/** The `i`-th word, cycling, so neighbours differ. */
export function word(i: number): string {
  return WORDS[((i % WORDS.length) + WORDS.length) % WORDS.length];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Words from the `i`-th on, `count` of them. */
function words(i: number, count: number): string[] {
  return Array.from({ length: count }, (_, k) => word(i + k * 7));
}

/**
 * `text`, made `length` characters long or a little shorter with plant
 * words in whole words: the title a long-names page shows.
 */
export function lengthenTitle(text: string, length = LONG_TITLE): string {
  let result = text;
  let i = text.length;
  while (result.length < length) {
    const next = `${result} ${i % 5 === 0 ? 'and' : word(i)}`;
    if (next.length > length) {
      break;
    }
    result = next;
    i += 3;
  }
  return result;
}

/**
 * `slug`, made exactly `length` characters long with hyphenated plant
 * words: a folder, file or branch name. Where the cut falls on a hyphen, the
 * name ends in the next word's first letter instead.
 */
export function lengthenSlug(slug: string, length: number): string {
  let result = slug;
  let i = slug.length;
  while (result.length <= length) {
    result = `${result}-${word(i)}`;
    i += 3;
  }
  const cut = result.slice(0, length);
  return cut.endsWith('-') ? `${cut.slice(0, -1)}${result[length]}` : cut;
}

/** A made-up person: "Hazel Thistle". */
export function personName(i: number): string {
  return words(i, 2).map(capitalize).join(' ');
}

/** A made-up GitHub login: `hazel-thistle`, or exactly `length` long. */
export function login(i: number, length = 0): string {
  const name = words(i, 2).join('-');
  return length ? lengthenSlug(name, length) : name;
}

/** A made-up customer, as the board names them: "Customer Hazel". */
export function customerName(i: number): string {
  return `Customer ${capitalize(word(i))}`;
}

/** A title of a few plant words: "Hazel thistle for the sorrel rollout". */
export function fixtureTitle(i: number, kind = 'rollout'): string {
  const [a, b, c] = words(i, 3);
  return `${capitalize(a)} ${b} for the ${c} ${kind} ${i + 1}`;
}
