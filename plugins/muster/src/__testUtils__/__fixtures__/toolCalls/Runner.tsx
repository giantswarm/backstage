import type { MusterApi } from '../../../apis';

function Runner({ api, tool }: { api: MusterApi; tool: string }) {
  api.callTool(tool, {});
  return null;
}

export function Page({ api }: { api: MusterApi }) {
  return <Runner api={api} tool="core_from_jsx" />;
}
