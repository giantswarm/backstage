import { CatalogProcessor } from '@backstage/plugin-catalog-node';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity, getEntitySourceLocation } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import {
  DefaultGithubCredentialsProvider,
  GithubCredentialsProvider,
  GithubCredentialType,
  ScmIntegrationRegistry,
  ScmIntegrations,
} from '@backstage/integration';
import {
  GS_LATEST_RELEASE_DATE,
  GS_LATEST_RELEASE_TAG,
} from '@giantswarm/backstage-plugin-gs-common';
import { graphql } from '@octokit/graphql';
import merge from 'lodash/merge';
import { formatVersion, isGSService } from './utils';
import { getRepositoryLatestRelease } from './github';

type GraphQL = typeof graphql;

export class ServiceReleaseInfoProcessor implements CatalogProcessor {
  private readonly integrations: ScmIntegrationRegistry;
  private readonly logger: LoggerService;
  private readonly githubCredentialsProvider: GithubCredentialsProvider;

  static fromConfig(
    config: Config,
    options: {
      logger: LoggerService;
      githubCredentialsProvider?: GithubCredentialsProvider;
    },
  ) {
    const integrations = ScmIntegrations.fromConfig(config);

    return new ServiceReleaseInfoProcessor({
      ...options,
      integrations,
    });
  }

  constructor(options: {
    integrations: ScmIntegrationRegistry;
    logger: LoggerService;
    githubCredentialsProvider?: GithubCredentialsProvider;
  }) {
    this.integrations = options.integrations;
    this.logger = options.logger;
    this.githubCredentialsProvider =
      options.githubCredentialsProvider ||
      DefaultGithubCredentialsProvider.fromIntegrations(this.integrations);
  }

  getProcessorName(): string {
    return 'ServiceReleaseInfoProcessor';
  }

  async preProcessEntity(entity: Entity): Promise<Entity> {
    if (!isGSService(entity)) {
      return entity;
    }

    const sourceLocation = getEntitySourceLocation(entity);

    const { client } = await this.createClient(sourceLocation.target);
    const { org, repoName } = parseGithubRepoUrl(sourceLocation.target);

    this.logger.info(
      `Reading latest release information for ${sourceLocation.target}`,
    );
    const response = await getRepositoryLatestRelease(client, org, repoName);

    if (!response) {
      return entity;
    }

    return merge(
      {
        metadata: {
          annotations: {
            [GS_LATEST_RELEASE_TAG]: formatVersion(response.name),
            [GS_LATEST_RELEASE_DATE]: response.createdAt,
          },
        },
      },
      entity,
    );
  }

  private async createClient(
    repoUrl: string,
  ): Promise<{ client: GraphQL; tokenType: GithubCredentialType }> {
    const gitHubConfig = this.integrations.github.byUrl(repoUrl)?.config;

    if (!gitHubConfig) {
      throw new Error(
        `There is no GitHub provider that matches ${repoUrl}. Please add a configuration for an integration.`,
      );
    }

    const { headers, type: tokenType } =
      await this.githubCredentialsProvider.getCredentials({
        url: repoUrl,
      });

    const client = graphql.defaults({
      baseUrl: gitHubConfig.apiBaseUrl,
      headers,
    });

    return { client, tokenType };
  }
}

export function parseGithubRepoUrl(urlString: string): {
  org: string;
  repoName: string;
} {
  const path = new URL(urlString).pathname.slice(1).split('/');

  if (path.length === 2 && path[0].length && path[1].length) {
    return {
      org: decodeURIComponent(path[0]),
      repoName: decodeURIComponent(path[1]),
    };
  }

  throw new Error(`Expected a URL pointing to /<org>/<repo>, got ${urlString}`);
}
