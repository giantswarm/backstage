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
    const TIMEOUT_MS = 5000;

    const fetchWithTimeout = async (
      installationName: string,
    ): Promise<{ tasks: ScaffolderTask[] }> => {
      const timeoutPromise = new Promise<{
        tasks: ScaffolderTask[];
        totalTasks?: number;
      }>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`Request to ${installationName} endpoint timed out`),
            ),
          TIMEOUT_MS,
        ),
      );

      const fetchPromise = new Promise<{
        tasks: ScaffolderTask[];
      }>(async (resolve, reject) => {
        let resetInstallation: VoidFunction | undefined = undefined;
        try {
          resetInstallation =
            DiscoveryApiClient.setInstallation(installationName);
          const result = await super.listTasks(options);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          if (resetInstallation) {
            resetInstallation();
          }
        }
      });

      return Promise.race([fetchPromise, timeoutPromise]);
    };

    const baseUrlOverrides = DiscoveryApiClient.getBaseUrlOverrides();
    const uniqueEndpoints = Array.from(
      new Set(Object.values(baseUrlOverrides)),
    );
    const installations = uniqueEndpoints
      .map(endpoint => {
        const matchingEntry = Object.entries(baseUrlOverrides).find(
          ([, value]) => value === endpoint,
        );
        return matchingEntry?.[0];
      })
      .filter(Boolean) as string[];

    const baseTasks = await super.listTasks(options);
    let allTasks = baseTasks.tasks;
    for (const installationName of installations) {
      try {
        const result = await fetchWithTimeout(installationName);
        allTasks = allTasks.concat(result.tasks);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to fetch tasks`, error);
      }
    }

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
      let resetInstallation: VoidFunction | undefined = undefined;

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
              resetInstallation =
                DiscoveryApiClient.setInstallation(installationName);
              resultObservable = super.streamLogs(options);
            } catch (e) {
              subscriber.error(e);
              if (resetInstallation) {
                resetInstallation();
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
        if (resetInstallation) {
          resetInstallation();
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
      let resetInstallation: VoidFunction | undefined = undefined;
      try {
        resetInstallation =
          DiscoveryApiClient.setInstallation(installationName);
        return await action();
      } finally {
        if (resetInstallation) {
          resetInstallation();
        }
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
