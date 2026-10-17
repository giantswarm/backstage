// Deliberate tsc and lint errors proving the Verify log shows them; removed before merge.
export const ciVerifyProofTsc: number = 'not a number';

export function ciVerifyProofLint(value: number) {
  value === 1;
  return value;
}
