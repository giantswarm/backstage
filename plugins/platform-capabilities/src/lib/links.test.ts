import { ACTION, installation } from '../fixtures/fakeApi';
import { linkify, repositoriesOf } from './links';

const REPOSITORIES = ['example/example-configs', 'example/example-mcs'];

describe('repositoriesOf', () => {
  it("names the installation's repositories and the pull requests', once each", () => {
    const target = installation({
      repositories: {
        configs: 'example/example-configs',
        managementClusters: 'example/example-mcs',
      },
    });
    expect(repositoriesOf(target, ACTION)).toEqual(REPOSITORIES);
    expect(repositoriesOf({}, ACTION)).toEqual(['example/example-configs']);
  });
});

describe('linkify', () => {
  it('links a file to the repository the sentence names after it, and the repository to its page', () => {
    const parts = linkify(
      'the fileset is gone from the default branch again: rowan (installations/rowan/config.yaml.patch in example/example-configs); Flux prunes what the tree applied',
      REPOSITORIES,
    );
    expect(parts).toEqual([
      {
        text: 'the fileset is gone from the default branch again: rowan (',
      },
      {
        text: 'installations/rowan/config.yaml.patch',
        href: 'https://github.com/example/example-configs/blob/HEAD/installations/rowan/config.yaml.patch',
      },
      { text: ' in ' },
      {
        text: 'example/example-configs',
        href: 'https://github.com/example/example-configs',
      },
      { text: '); Flux prunes what the tree applied' },
    ]);
  });

  it('places a file in the one repository the message names, wherever it names it', () => {
    const parts = linkify(
      'example/example-mcs: secrets.yaml is frozen',
      REPOSITORIES,
    );
    expect(parts[2]).toEqual({
      text: 'secrets.yaml',
      href: 'https://github.com/example/example-mcs/blob/HEAD/secrets.yaml',
    });
  });

  it('leaves a file unlinked where the message names no repository, and a path that is not a file alone', () => {
    expect(
      linkify('rowan is unreadable (installations/rowan: 404)', REPOSITORIES),
    ).toEqual([{ text: 'rowan is unreadable (installations/rowan: 404)' }]);
    expect(linkify('the record selects chart line 3', REPOSITORIES)).toEqual([
      { text: 'the record selects chart line 3' },
    ]);
  });

  it('links a URL to itself', () => {
    expect(
      linkify('see https://github.com/example/example-configs/pull/7.', []),
    ).toEqual([
      { text: 'see ' },
      {
        text: 'https://github.com/example/example-configs/pull/7',
        href: 'https://github.com/example/example-configs/pull/7',
      },
      { text: '.' },
    ]);
  });
});
