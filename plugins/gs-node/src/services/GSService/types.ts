import {
  BackstageCredentials,
  // BackstageUserPrincipal,
  createServiceRef,
} from '@backstage/backend-plugin-api';

// export interface TodoItem {
//   title: string;
//   id: string;
//   createdBy: string;
//   createdAt: string;
// }

export interface GSService {
  // createTodo(
  //   input: {
  //     title: string;
  //     entityRef?: string;
  //   },
  //   options: {
  //     credentials: BackstageCredentials<BackstageUserPrincipal>;
  //   },
  // ): Promise<TodoItem>;

  // listTodos(): Promise<{ items: TodoItem[] }>;

  // getTodo(request: { id: string }): Promise<TodoItem>;
  getClusters(options: { credentials: BackstageCredentials }): Promise<
    {
      name: string;
      url: string;
      authProvider: string;
      oidcTokenProvider: string;
    }[]
  >;

  updateClusters(
    clustersInfo: {
      name: string;
      url: string;
      authProvider: string;
      oidcTokenProvider: string;
    }[],
    options: { credentials: BackstageCredentials },
  ): Promise<void>;
}

export const gsServiceRef = createServiceRef<GSService>({
  scope: 'root',
  id: 'gs.root',
});
