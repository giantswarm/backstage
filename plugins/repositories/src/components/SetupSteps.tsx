import { Table, TableColumn } from '@backstage/core-components';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';
import { SetupResult, SetupStep } from '../apis';
import { stepDetail, verdictIntent } from '../lib/setupStatus';

type StepRow = SetupStep & { id: string };

const columns: TableColumn<StepRow>[] = [
  { title: 'Step', field: 'step', width: '20%' },
  {
    title: 'Verdict',
    field: 'verdict',
    width: '20%',
    render: step => (
      <StatusLabel label={step.verdict} intent={verdictIntent(step.verdict)} />
    ),
  },
  {
    title: 'Detail',
    field: 'detail',
    cellStyle: { whiteSpace: 'normal', wordBreak: 'break-word' },
    render: stepDetail,
  },
];

/**
 * The engine's set-up steps for one repository, in the order they run: the
 * step, its verdict as a status, and the detail `devctl repo status` prints
 * (summary, changes, findings count) wrapped to read.
 */
export function SetupSteps({ result }: { result: SetupResult }) {
  return (
    <div data-testid="setup-steps">
      <Table<StepRow>
        options={{
          toolbar: false,
          paging: false,
          search: false,
          sorting: false,
          draggable: false,
          padding: 'dense',
        }}
        data={result.steps.map(step => ({ ...step, id: step.step }))}
        style={{ width: '100%', boxShadow: 'none' }}
        columns={columns}
      />
    </div>
  );
}
