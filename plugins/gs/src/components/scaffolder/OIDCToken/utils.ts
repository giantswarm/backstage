import { JsonArray, JsonObject } from '@backstage/types';
import { oidcTokenInstallation } from './schema';

export function getOIDCTokenInstallation(
  parameters: JsonObject,
): string | null {
  const oidcTokenValue = getObject(parameters, (object, prop) => {
    return prop === oidcTokenInstallation && typeof object[prop] === 'string';
  });

  if (!oidcTokenValue) {
    return null;
  }

  return oidcTokenValue[oidcTokenInstallation] as string;
}

function getObject(
  theObject: JsonObject | JsonArray,
  predicate: (object: JsonObject, prop: string) => boolean,
): JsonObject | null {
  let result = null;
  if (Array.isArray(theObject)) {
    for (let i = 0; i < theObject.length; i++) {
      const el = theObject[i];
      if (el && (Array.isArray(el) || typeof el === 'object')) {
        result = getObject(el, predicate);
        if (result) {
          break;
        }
      }
    }
  } else {
    for (const prop of Object.keys(theObject)) {
      if (predicate(theObject, prop)) {
        return theObject;
      }
      const el = theObject[prop];
      if (el && (Array.isArray(el) || typeof el === 'object')) {
        result = getObject(el, predicate);
        if (result) {
          break;
        }
      }
    }
  }
  return result;
}
