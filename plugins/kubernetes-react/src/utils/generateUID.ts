const uidRegexp = /^[a-z]([a-z][0-9]|[0-9][a-z])+[a-z0-9]?$/;
const supportedUIDChars = '023456789abcdefghijkmnopqrstuvwxyz';

/**
 * Generate unique resource names, that can be used for resource names.
 * @param length
 */
export function generateUID(length: number): string {
  if (length < 3) {
    throw new Error('Length is too short');
  }

  const id = new Array(length);

  for (;;) {
    for (let i = 0; i < id.length; i++) {
      const nextCharIdx = Math.ceil(
        (supportedUIDChars.length - 1) * Math.random(),
      );

      id[i] = supportedUIDChars[nextCharIdx];
    }

    const idString = id.join('');
    if (!uidRegexp.test(idString)) {
      continue;
    }

    return idString;
  }
}
