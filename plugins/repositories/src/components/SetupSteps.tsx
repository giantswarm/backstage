import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import { SetupResult } from '../apis';
import { convergedState, resultFindings, stepDetail } from '../lib/setupStatus';

/**
 * The engine's set-up steps for one repository, laid out as `devctl repo
 * status` prints them: the header with the converged state, STEP / VERDICT /
 * DETAIL per step, the findings with their fix.
 */
export function SetupSteps({
  result,
  title,
}: {
  result: SetupResult;
  title: string;
}) {
  const findings = resultFindings(result);
  return (
    <div data-testid="setup-steps">
      <Typography variant="subtitle2">
        {title}: {result.repository} ({result.mode})
        {result.declared !== result.repository &&
          ` — declared as ${result.declared}`}
        : <span data-testid="setup-state">{convergedState(result)}</span>
      </Typography>
      <Table size="small" aria-label={title}>
        <TableHead>
          <TableRow>
            <TableCell>Step</TableCell>
            <TableCell>Verdict</TableCell>
            <TableCell>Detail</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {result.steps.map(step => (
            <TableRow key={step.step} data-verdict={step.verdict}>
              <TableCell>{step.step}</TableCell>
              <TableCell>{step.verdict}</TableCell>
              <TableCell>{stepDetail(step)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {findings.length > 0 && (
        <>
          <Typography variant="subtitle2" style={{ marginTop: 8 }}>
            Findings
          </Typography>
          <ul data-testid="setup-findings">
            {findings.map((finding, index) => (
              <li key={`${finding.kind}-${index}`}>
                [{finding.kind}] {finding.message}
                {finding.fix && (
                  <Typography variant="body2" color="textSecondary">
                    fix: {finding.fix}
                  </Typography>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
