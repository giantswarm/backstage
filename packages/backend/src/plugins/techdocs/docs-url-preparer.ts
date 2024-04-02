import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import {
  PreparerBase,
  PreparerConfig,
  PreparerOptions,
  PreparerResponse,
  UrlPreparer,
} from '@backstage/plugin-techdocs-node';
import { Entity } from '@backstage/catalog-model';
import { Logger } from 'winston';

/**
 * Returns capitalized file name without extention, e.g. README.md -> Readme
 */
function formatFileName(filename: string) {
  const fileName = path.parse(filename).name;

  return fileName[0].toUpperCase() + fileName.substring(1).toLowerCase();
}

/**
 * Returns a list of navigation items. It's constructed from:
 * - a list of links to *.md files ordered alphabetically (README.md go first)
 * - an optional link to docs subcomponent
 */
function getNavigationItems(mdFiles: string[], docsComponentName?: string) {
  const sortedFilenames = mdFiles.filter(file => file !== 'README.md').sort();
  const readme = mdFiles.find(file => file === 'README.md');
  if (readme) {
    sortedFilenames.unshift(readme);
  }

  const items = sortedFilenames.map(filename => ({
    [formatFileName(filename)]: `${filename}`,
  }));

  if (docsComponentName) {
    items.push({ Docs: `!include ./${docsComponentName}/mkdocs.yaml` });
  }

  return items;
}

/**
 * Returns branch name from the techdocs-ref URL
 */
function getBranchNameFromTechDocsRef(url: string) {
  const parts = url.split('/');

  return parts.pop() || parts.pop();
}

/**
 * Constructs edit URI for provided entity
 */
function getEditURI(entity: Entity) {
  const techdocsURL =
    entity.metadata.annotations?.['backstage.io/techdocs-ref'];
  const sourceLocationURL =
    entity.metadata.annotations?.['backstage.io/source-location'];
  if (!techdocsURL || !sourceLocationURL) {
    return '';
  }

  const sourceLocation = sourceLocationURL.replace(/^url:/, '');
  const defaultBranchName = getBranchNameFromTechDocsRef(techdocsURL);

  return `${sourceLocation}/edit/${defaultBranchName}`;
}

export class DocsUrlPreparer implements PreparerBase {
  private originalPreparer: UrlPreparer;
  private readonly _logger: Logger;
  public get logger(): Logger {
    return this._logger;
  }

  private constructor(preparer: UrlPreparer, logger: Logger) {
    this.originalPreparer = preparer;
    this._logger = logger;
  }

  shouldCleanPreparedDirectory(): boolean {
    return true;
  }

  static fromConfig(config: PreparerConfig): DocsUrlPreparer {
    return new DocsUrlPreparer(UrlPreparer.fromConfig(config), config.logger);
  }

  prepare(
    entity: Entity,
    options?: PreparerOptions | undefined,
  ): Promise<PreparerResponse> {
    return this.originalPreparer.prepare(entity, options).then(response => {
      options?.logger?.info('Running preparer');

      const root = response.preparedDir;

      /**
       * If a repository contains docs folder and mkdocs.yaml move them to a sub-directory
       * processed by mkdocs-monorepo-plugin.
       */
      let docsComponentName;
      if (fs.existsSync(`${root}/docs`)) {
        docsComponentName = 'docs-component';
        const docsComponentPath = `${root}/${docsComponentName}`;
        fse.moveSync(`${root}/docs`, `${docsComponentPath}/docs`);
        options?.logger?.info(
          `Moved ${root}/docs into ${docsComponentPath}/docs`,
        );
        if (fs.existsSync(`${root}/mkdocs.yaml`)) {
          fse.moveSync(
            `${root}/mkdocs.yaml`,
            `${docsComponentPath}/mkdocs.yaml`,
          );
          options?.logger?.info(
            `Moved ${root}/mkdocs.yaml into ${docsComponentPath}/mkdocs.yaml`,
          );
        } else if (fs.existsSync(`${root}/mkdocs.yml`)) {
          fse.moveSync(
            `${root}/mkdocs.yml`,
            `${docsComponentPath}/mkdocs.yaml`,
          );
          options?.logger?.info(
            `Moved ${root}/mkdocs.yml into ${docsComponentPath}/mkdocs.yaml`,
          );
        } else {
          fs.writeFileSync(
            `${docsComponentPath}/mkdocs.yaml`,
            yaml.dump({ site_name: 'docs' }),
          );
          options?.logger?.info(
            `Wrote standard mkdocs.yaml into ${docsComponentPath}/mkdocs.yaml`,
          );
        }
      }

      /**
       * Create docs folder and move *.md files into it.
       */
      fs.mkdirSync(`${root}/docs`);
      options?.logger?.info(`Created docs folder`);

      const files = fs.readdirSync(root);
      const mdFiles: string[] = [];
      files.forEach(file => {
        if (file.endsWith('.md')) {
          mdFiles.push(file);
          fs.copyFileSync(`${root}/${file}`, `${root}/docs/${file}`);
          options?.logger?.info(
            `Copied ${root}/${file} into ${root}/docs/${file}`,
          );
        }
      });

      /**
       * Create mkdocs configuration file with navigation
       */
      const mkdocs = {
        site_name: entity.metadata.name,
        edit_uri: getEditURI(entity),
        nav: getNavigationItems(mdFiles, docsComponentName),
        plugins: ['monorepo'],
      };

      fs.writeFileSync(`${root}/mkdocs.yaml`, yaml.dump(mkdocs));
      options?.logger?.info(
        `Wrote mkdocs.yaml with navigation into ${root}/mkdocs.yaml`,
      );

      return response;
    });
  }
}
