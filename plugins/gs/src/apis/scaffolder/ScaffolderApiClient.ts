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

const SESSION_TASK_INSTALLATION = 'gs-task-installation';
const DEFAULT_INSTALLATION_TOKEN = 'default';

export class ScaffolderApiClient extends ScaffolderClient {
  private cachedTasks: ScaffolderTask[] = [];

  async scaffold(
    options: ScaffolderScaffoldOptions,
  ): Promise<ScaffolderScaffoldResponse> {
    const { values } = options;
    const installationName = getOIDCTokenInstallation(values);

    const result = await this.withInstallation(installationName, () =>
      super.scaffold(options),
    );

    this.setInstallationToSessionStorage(result.taskId, installationName);
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
        // Temporarily set installation for this specific call
        DiscoveryApiClient.setInstallation(installationName);
        promises.push(super.listTasks(options));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to fetch tasks from ${installationName}`, error);
      } finally {
        // Reset to default/previous state immediately after queuing the promise
        DiscoveryApiClient.resetInstallation();
      }
    });

    const results = await Promise.allSettled(promises);
    let allTasks: ScaffolderTask[] = [];

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        allTasks = allTasks.concat(result.value.tasks);
      }
      if (result.status === 'rejected') {
        // eslint-disable-next-line no-console
        console.error(`Failed to fetch tasks, ${result.reason}`);
      }
    });

    allTasks.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const aggregatedResult = {
      tasks: allTasks,
      totalTasks: allTasks.length,
    };

    this.cachedTasks = aggregatedResult.tasks;

    return Promise.resolve(aggregatedResult);
  }

  async getTask(taskId: string): Promise<ScaffolderTask> {
    const installationName = await this.getTaskInstallation(taskId);

    return this.withInstallation(installationName, () => super.getTask(taskId));
  }

  streamLogs(options: ScaffolderStreamLogsOptions): Observable<LogEvent> {
    return new ObservableImpl(subscriber => {
      let underlyingSubscription: ZenObservable.Subscription | undefined;
      let installationWasSet = false;

      this.getTaskInstallation(options.taskId)
        .then(installationName => {
          if (subscriber.closed) {
            return;
          }

          let resultObservable: Observable<LogEvent>;

          if (
            installationName &&
            installationName !== DEFAULT_INSTALLATION_TOKEN
          ) {
            try {
              DiscoveryApiClient.setInstallation(installationName);
              installationWasSet = true;
              resultObservable = super.streamLogs(options);
            } catch (e) {
              subscriber.error(e);
              // If setInstallation succeeded but super.streamLogs failed, reset.
              if (installationWasSet) {
                DiscoveryApiClient.resetInstallation();
                installationWasSet = false; // Avoid double reset in cleanup
              }
              return;
            }
          } else {
            resultObservable = super.streamLogs(options);
          }

          underlyingSubscription = resultObservable.subscribe({
            next: event => subscriber.next(event),
            error: err => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        })
        .catch(err => {
          subscriber.error(err);
        });

      return () => {
        // Cleanup function
        if (underlyingSubscription) {
          underlyingSubscription.unsubscribe();
        }
        if (installationWasSet) {
          DiscoveryApiClient.resetInstallation();
          installationWasSet = false;
        }
      };
    });
  }

  private async withInstallation<T>(
    installationName: string | null | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    const needsOverride =
      installationName && installationName !== DEFAULT_INSTALLATION_TOKEN;

    if (needsOverride) {
      try {
        DiscoveryApiClient.setInstallation(installationName);
        return await action();
      } finally {
        DiscoveryApiClient.resetInstallation();
      }
    } else {
      return action();
    }
  }

  private async getTaskInstallation(taskId: string): Promise<string> {
    const valueFromSessionStorage =
      this.getInstallationFromSessionStorage(taskId);

    if (valueFromSessionStorage) {
      return valueFromSessionStorage;
    }

    let task = this.cachedTasks.find(t => t.id === taskId);

    if (!task) {
      const tasksList = await this.listTasks({
        filterByOwnership: 'all',
      });
      task = tasksList.tasks.find(t => t.id === taskId);
    }

    if (task) {
      return (
        getOIDCTokenInstallation(task.spec.parameters) ??
        DEFAULT_INSTALLATION_TOKEN
      );
    }

    return DEFAULT_INSTALLATION_TOKEN;
  }

  private getInstallationFromSessionStorage(taskId: string) {
    return sessionStorage.getItem(`${SESSION_TASK_INSTALLATION}-${taskId}`);
  }

  private setInstallationToSessionStorage(
    taskId: string,
    installation: string | null,
  ) {
    sessionStorage.setItem(
      `${SESSION_TASK_INSTALLATION}-${taskId}`,
      installation ?? DEFAULT_INSTALLATION_TOKEN,
    );
  }
}
