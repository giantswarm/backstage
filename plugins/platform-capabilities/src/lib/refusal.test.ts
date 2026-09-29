import { VerifyResult } from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  APP_ID_NOT_ON_RECORD,
  COMMIT_REFUSED,
  CUSTOMER_PORTAL_DEFINITION,
  DOMAIN_REFUSED,
  MISSING_CHOICES,
  NOT_COMPARED,
  VERIFIED,
} from '../fixtures/fakeApi';
import { reasonOf, refusalStatus, RefusalStatus } from './refusal';
import { Field, fieldsOf, formOf } from './schemaForm';

const agentPlatform = fieldsOf(formOf(AGENT_PLATFORM_DEFINITION.inputSchema!));
const portal = fieldsOf(formOf(CUSTOMER_PORTAL_DEFINITION.inputSchema!));

describe('refusal', () => {
  it("reads the definition's refusal over the commit's copy of it, and none where the manager accepted", () => {
    expect(reasonOf(NOT_COMPARED)).toBe(NOT_COMPARED.refused);
    expect(reasonOf({ refused: 'the record', commitRefused: 'a copy' })).toBe(
      'the record',
    );
    expect(reasonOf(COMMIT_REFUSED)).toBe(COMMIT_REFUSED.commitRefused);
    expect(reasonOf(VERIFIED)).toBeUndefined();
    expect(reasonOf(undefined)).toBeUndefined();
  });

  it.each<[string, VerifyResult, Field[], RefusalStatus]>([
    [
      'a fact of the record, the chart line',
      NOT_COMPARED,
      agentPlatform,
      'warning',
    ],
    ['a file on record, dex-app', COMMIT_REFUSED, agentPlatform, 'warning'],
    ['the choices not on record', MISSING_CHOICES, agentPlatform, 'info'],
    [
      'a value supplied at commit, the GitHub App id',
      APP_ID_NOT_ON_RECORD,
      portal,
      'info',
    ],
    [
      "a choice of the form, the portal's hostname",
      DOMAIN_REFUSED,
      portal,
      'info',
    ],
    [
      'a fact of the record while choices are missing too',
      {
        ...NOT_COMPARED,
        inputs: { ...NOT_COMPARED.inputs!, missing: ['kagent.enabled'] },
      },
      agentPlatform,
      'warning',
    ],
  ])('reads a refusal for %s as %s', (_, result, fields, status) => {
    expect(refusalStatus(result, fields)).toBe(status);
  });
});
