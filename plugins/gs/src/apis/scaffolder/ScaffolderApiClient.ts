import {
  LogEvent,
  ScaffolderScaffoldOptions,
  ScaffolderScaffoldResponse,
  ScaffolderStreamLogsOptions,
  ScaffolderTask,
} from '@backstage/plugin-scaffolder-react';
import { ScaffolderClient } from '@backstage/plugin-scaffolder';
import { Observable } from '@backstage/types';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { getOIDCTokenInstallation } from '../../components/scaffolder/OIDCToken/utils';
import ObservableImpl from 'zen-observable';

type InstallationValue = {
  installationName: string;
};

export class ScaffolderApiClient extends ScaffolderClient {
  async scaffold(
    options: ScaffolderScaffoldOptions,
  ): Promise<ScaffolderScaffoldResponse> {
    const { values } = options;
    const installationName = ((values.installation as InstallationValue) ?? {})
      .installationName;

    if (!installationName) {
      return super.scaffold(options);
    }

    let result: ScaffolderScaffoldResponse;
    try {
      DiscoveryApiClient.setInstallation(installationName);
      result = await super.scaffold(options);
    } finally {
      DiscoveryApiClient.resetInstallation();
    }

    return result;
  }

  async listTasks(options: {
    filterByOwnership: 'owned' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: ScaffolderTask[]; totalTasks?: number }> {
    const installations =
      DiscoveryApiClient.getInstallationsWithBaseUrlOverrides();

    const promises = [super.listTasks(options)];
    installations.forEach(installationName => {
      try {
        DiscoveryApiClient.setInstallation(installationName);
        promises.push(super.listTasks(options));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to fetch tasks from ${installationName}`, error);
      } finally {
        DiscoveryApiClient.resetInstallation();
      }
    });

    const results = await Promise.allSettled(promises);

    return Promise.resolve(
      results.reduce(
        (acc, result) => {
          if (result.status === 'fulfilled') {
            acc.tasks = [...acc.tasks, ...result.value.tasks].sort((a, b) => {
              return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
              );
            });
            acc.totalTasks = acc.tasks.length;
          }

          if (result.status === 'rejected') {
            // eslint-disable-next-line no-console
            console.error(`Failed to fetch tasks, ${result.reason}`);
          }

          return acc;
        },
        {
          tasks: [] as ScaffolderTask[],
          totalTasks: 0,
        },
      ),
    );
  }

  async getTask(taskId: string): Promise<ScaffolderTask> {
    const installationName = await this.getTaskInstallation(taskId);

    if (!installationName) {
      return super.getTask(taskId);
    }

    let result: ScaffolderTask;
    try {
      DiscoveryApiClient.setInstallation(installationName);
      result = await super.getTask(taskId);
    } finally {
      DiscoveryApiClient.resetInstallation();
    }

    return result;
  }

  streamLogs(options: ScaffolderStreamLogsOptions): Observable<LogEvent> {
    return new ObservableImpl(subscriber => {
      this.getTaskInstallation(options.taskId).then(installationName => {
        let result: Observable<LogEvent>;

        if (!installationName) {
          result = super.streamLogs(options);
        } else {
          DiscoveryApiClient.setInstallation(installationName);
          result = super.streamLogs(options);
        }

        result.subscribe(event => {
          subscriber.next(event);

          if (event.type === 'completion') {
            DiscoveryApiClient.resetInstallation();
            subscriber.complete();
            return;
          }
        });
      });
    });
  }

  private async getTaskInstallation(taskId: string): Promise<string | null> {
    const tasks = await this.listTasks({
      filterByOwnership: 'all',
    });

    const task = tasks.tasks.find(t => t.id === taskId);
    if (!task) {
      return null;
    }

    return getOIDCTokenInstallation(task.spec.parameters);
  }
}
