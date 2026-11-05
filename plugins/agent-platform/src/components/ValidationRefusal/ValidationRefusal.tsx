import type { ReactNode } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { SimpleAccordion } from '@giantswarm/backstage-plugin-ui-react';

import {
  VALIDATION_REFUSAL_COPY,
  validationRefusalLeads,
} from '../../lib/egressCopy';

const useStyles = makeStyles(theme => ({
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
    // agent-manager's words carry origins and paths, long single words.
    overflowWrap: 'anywhere',
  },
}));

/**
 * agent-manager's refusal of a dry run (`validate_agent`), led by what to do:
 * a refusal it recognises (an egress origin on a coding Harness,
 * `codingEgressRefusal`) in plain words, any other with a generic lead
 * (`validationRefusalLeads`). Every schema violation and precondition failure
 * stays verbatim under Technical details, until `validate_agent` reports codes
 * the portal can word reliably (giantswarm/agent-manager#144). Shown on the
 * agent wizard's review step and in Change Harness.
 */
export function ValidationRefusal({
  errors,
  title,
  harness,
  children,
}: {
  errors: string[];
  /** What cannot happen (`VALIDATION_REFUSAL_COPY`'s titles). */
  title: string;
  /** The Harness the dry run checked against, so the lead names it by its title. */
  harness?: { name: string; title?: string };
  /** A line after the leads, such as where to fix it. */
  children?: ReactNode;
}) {
  const classes = useStyles();
  return (
    <Alert
      status="danger"
      title={title}
      description={
        <Flex direction="column" gap="2">
          {validationRefusalLeads(errors, harness).map(lead => (
            <Text key={lead} as="p" variant="body-small">
              {lead}
            </Text>
          ))}
          {children}
          <SimpleAccordion
            title={VALIDATION_REFUSAL_COPY.detailsTitle}
            headingLevel={4}
          >
            <ul className={classes.violations} aria-label="Violations">
              {errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </SimpleAccordion>
        </Flex>
      }
    />
  );
}
