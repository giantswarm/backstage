/**
 * Type declaration for the untyped `@giantswarm/pro` package (plain ESM
 * JavaScript). Only the subset used by this plugin is declared; the full
 * shapes live in `proApi.ts`.
 */
declare module '@giantswarm/pro' {
  import type { ProApi } from './proApi';

  export const resolveBoardId: ProApi['resolveBoardId'];
  export const listItems: ProApi['listItems'];
  export const getItemByID: ProApi['getItemByID'];
  export const updateItemField: ProApi['updateItemField'];
  export const listFields: ProApi['listFields'];
  export const findFieldByName: ProApi['findFieldByName'];
  export const findMatchingOption: ProApi['findMatchingOption'];
  export const findMatchingIteration: ProApi['findMatchingIteration'];
  export const listSubIssues: ProApi['listSubIssues'];
  export const addSubIssue: ProApi['addSubIssue'];
  export const removeSubIssue: ProApi['removeSubIssue'];
  export const getParentIssue: ProApi['getParentIssue'];
  export const parseIssueRef: ProApi['parseIssueRef'];
  export const resolveIssueId: ProApi['resolveIssueId'];
  export const graphQLWithAuth: ProApi['graphQLWithAuth'];
}
