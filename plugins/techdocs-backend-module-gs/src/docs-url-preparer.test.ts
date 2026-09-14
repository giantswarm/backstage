import fs from 'fs';
import os from 'os';
import path from 'path';
import { load } from 'js-yaml';
import { Entity } from '@backstage/catalog-model';
import { UrlPreparer } from '@backstage/plugin-techdocs-node';
import { DocsUrlPreparer } from './docs-url-preparer';

jest.mock('@backstage/plugin-techdocs-node', () => ({
  UrlPreparer: { fromConfig: jest.fn() },
}));

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
};

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'alfred-app',
    annotations: {
      'backstage.io/techdocs-ref':
        'url:https://github.com/giantswarm/alfred-app/tree/main',
      'backstage.io/source-location':
        'url:https://github.com/giantswarm/alfred-app',
    },
  },
  spec: { type: 'service', owner: 'team', lifecycle: 'production' },
};

type MkDocs = {
  site_name: string;
  edit_uri: string;
  nav: Record<string, string>[];
  plugins: string[];
};

function readMkDocs(dir: string): MkDocs {
  return load(fs.readFileSync(`${dir}/mkdocs.yaml`, 'utf8')) as MkDocs;
}

async function runPreparer(preparedDir: string) {
  (UrlPreparer.fromConfig as jest.Mock).mockReturnValue({
    prepare: jest.fn().mockResolvedValue({ preparedDir, etag: 'etag' }),
  });

  const preparer = DocsUrlPreparer.fromConfig({ logger } as any);

  return preparer.prepare(entity, { logger } as any);
}

describe('DocsUrlPreparer', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-url-preparer-'));
    fs.writeFileSync(
      `${root}/README.md`,
      '# Alfred\n\n![events](./docs/events.png)\n',
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  it('keeps a docs folder without Markdown files out of the monorepo nav', async () => {
    fs.mkdirSync(`${root}/docs`);
    fs.writeFileSync(`${root}/docs/events.png`, 'png');

    await runPreparer(root);

    expect(fs.existsSync(`${root}/docs-component`)).toBe(false);
    expect(fs.existsSync(`${root}/.docs-assets`)).toBe(false);
    expect(fs.existsSync(`${root}/docs/docs/events.png`)).toBe(true);
    expect(readMkDocs(root).nav).toEqual([{ Readme: 'README.md' }]);
  });

  it('ignores nested folders without Markdown files', async () => {
    fs.mkdirSync(`${root}/docs/images`, { recursive: true });
    fs.writeFileSync(`${root}/docs/images/events.png`, 'png');

    await runPreparer(root);

    expect(fs.existsSync(`${root}/docs-component`)).toBe(false);
    expect(fs.existsSync(`${root}/docs/docs/images/events.png`)).toBe(true);
  });

  it('moves a docs folder with Markdown files into a docs component', async () => {
    fs.mkdirSync(`${root}/docs`);
    fs.writeFileSync(`${root}/docs/guide.md`, '# Guide\n');
    fs.writeFileSync(`${root}/docs/events.png`, 'png');

    await runPreparer(root);

    expect(fs.existsSync(`${root}/docs-component/docs/guide.md`)).toBe(true);
    expect(fs.existsSync(`${root}/docs-component/docs/events.png`)).toBe(true);
    expect(readMkDocs(`${root}/docs-component`)).toEqual({ site_name: 'docs' });
    expect(readMkDocs(root).nav).toEqual([
      { Readme: 'README.md' },
      { Docs: '!include ./docs-component/mkdocs.yaml' },
    ]);
  });

  it('finds Markdown files in nested folders of a docs folder', async () => {
    fs.mkdirSync(`${root}/docs/guides`, { recursive: true });
    fs.writeFileSync(`${root}/docs/guides/guide.md`, '# Guide\n');

    await runPreparer(root);

    expect(fs.existsSync(`${root}/docs-component/docs/guides/guide.md`)).toBe(
      true,
    );
  });

  it('keeps an existing mkdocs.yaml as the docs component configuration', async () => {
    fs.mkdirSync(`${root}/docs`);
    fs.writeFileSync(`${root}/docs/guide.md`, '# Guide\n');
    fs.writeFileSync(`${root}/mkdocs.yaml`, 'site_name: alfred\n');

    await runPreparer(root);

    expect(readMkDocs(`${root}/docs-component`)).toEqual({
      site_name: 'alfred',
    });
  });

  it('builds a nav from root Markdown files when there is no docs folder', async () => {
    fs.writeFileSync(`${root}/CHANGELOG.md`, '# Changelog\n');

    await runPreparer(root);

    const mkdocs = readMkDocs(root);
    expect(mkdocs.site_name).toEqual('alfred-app');
    expect(mkdocs.edit_uri).toEqual(
      'https://github.com/giantswarm/alfred-app/edit/main',
    );
    expect(mkdocs.plugins).toEqual(['monorepo']);
    expect(mkdocs.nav).toEqual([
      { Readme: 'README.md' },
      { Changelog: 'CHANGELOG.md' },
    ]);
  });
});
