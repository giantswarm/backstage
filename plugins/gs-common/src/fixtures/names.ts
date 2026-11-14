import type { FixtureRandom } from './random';

/**
 * The words fixture names are made of: plants, so no name is that of a real
 * installation, customer or repository. `meadow`, the installation fixture
 * mode serves, is left out so no generated name repeats it.
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
  'rush',
  'sage',
  'sedge',
  'sorrel',
  'tansy',
  'teasel',
  'thistle',
  'thyme',
  'vetch',
  'willow',
  'yarrow',
] as const;

/** A Kubernetes object name's limit, which every fixture name keeps to. */
export const MAX_NAME_LENGTH = 63;

/** A generated name and the display name made of the same words. */
export type FixtureName = { name: string; displayName: string };

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** A word other than `last`, so no name repeats a word in a row. */
function nextWord(random: FixtureRandom, last?: string): string {
  let word: string = random.pick(WORDS);
  while (word === last) {
    word = random.pick(WORDS);
  }
  return word;
}

/** A name cut to `length`, without a hyphen at its end. */
export function fitName(name: string, length: number): string {
  return name.slice(0, length).replace(/-+$/, '');
}

/**
 * Makes names unique within one list: two words or more, joined with `-`,
 * until the name is at least `nameLength` characters long (cut at
 * {@link MAX_NAME_LENGTH}). The display name has the same words, whole: it
 * has no length limit. A name already given gets a number appended, to both.
 */
export function createNamer(random: FixtureRandom) {
  const given = new Set<string>();
  return (nameLength = 0): FixtureName => {
    const words = [nextWord(random)];
    while (words.length < 2 || words.join('-').length < nameLength) {
      words.push(nextWord(random, words[words.length - 1]));
    }
    const base = fitName(words.join('-'), MAX_NAME_LENGTH);
    const displayName = words.map(capitalize).join(' ');
    let name = base;
    let n = 1;
    while (given.has(name)) {
      n++;
      name = `${fitName(base, MAX_NAME_LENGTH - `-${n}`.length)}-${n}`;
    }
    given.add(name);
    return { name, displayName: n > 1 ? `${displayName} ${n}` : displayName };
  };
}

const SENTENCES = [
  (a: string, b: string) => `Looks after the ${a} and ${b} services.`,
  (a: string, b: string) => `Answers questions about ${a} rollouts in ${b}.`,
  (a: string, b: string) => `Keeps the ${a} catalogue in step with ${b}.`,
  (a: string, b: string) => `Reviews ${a} changes before they reach ${b}.`,
];

/** A one-sentence description made of the fixture words. */
export function fixtureSentence(random: FixtureRandom): string {
  const sentence = random.pick(SENTENCES);
  const first = nextWord(random);
  return sentence(first, nextWord(random, first));
}
