import fs from 'fs';
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

export class DocsUrlPreparer implements PreparerBase {
    private originalPreparer: UrlPreparer;
    private readonly logger: Logger;

    private constructor(preparer: UrlPreparer, logger: Logger) {
        this.originalPreparer = preparer;
        this.logger = logger;
    }

    static fromConfig(config: PreparerConfig): DocsUrlPreparer {
        return new DocsUrlPreparer(UrlPreparer.fromConfig(config), config.logger);
    }

    prepare(entity: Entity, options?: PreparerOptions | undefined): Promise<PreparerResponse> {
        return this.originalPreparer.prepare(entity, options).then((response) => {
            const docsPath =  `${response.preparedDir}/docs`;
            this.logger.info("Running preparer")
            if (!fs.existsSync(docsPath)) {
                fs.mkdirSync(docsPath);
                options?.logger?.info(`Created missing docs directory ${docsPath}`)
                fs.copyFileSync(`${response.preparedDir}/README.md`, `${docsPath}/index.md`)
                options?.logger?.info(`Copied readme to ${docsPath}/index.md`)

                const mkdocs = {
                    "site_name": `${entity.metadata.name} README`,
                    "site_description": entity.metadata.description,
                    "docs_dir": "docs",
                    "repo_url": "",
                    "edit_url": ""
                };

                fs.writeFileSync(`${response.preparedDir}/mkdocs.yaml`, yaml.dump(mkdocs));
                options?.logger?.info(`Wrote standard ${docsPath}/mkdocs.yaml`);
            } else {
                this.logger.info("Docs folder exists, not doing anything.")
            }

            return response;
        })
    };
};
