import { useMemo, useRef } from 'react';
import Ajv, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

function createAjv(): Ajv {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  // Register OpenAPI-specific formats that aren't in the JSON Schema spec
  // so Ajv doesn't warn about them.
  ajv.addFormat('int32', true);
  ajv.addFormat('int64', true);
  ajv.addFormat('float', true);
  ajv.addFormat('double', true);
  ajv.addFormat('byte', true);
  ajv.addFormat('binary', true);
  ajv.addFormat('password', true);
  return ajv;
}

/**
 * Validates merged values against a Helm chart's JSON schema using AJV.
 * Returns an array of warning strings. Empty array means valid.
 */
export function useHelmValuesValidation(
  mergedValues: Record<string, any>,
  jsonSchema: Record<string, any> | null | undefined,
): { warnings: string[] } {
  const ajvRef = useRef<Ajv | null>(null);
  const compiledSchemaRef = useRef<{
    schema: Record<string, any>;
    validate: ValidateFunction | null;
  } | null>(null);

  const warnings = useMemo(() => {
    if (!mergedValues || Object.keys(mergedValues).length === 0) {
      return [];
    }

    if (!jsonSchema) {
      return [];
    }

    try {
      // Lazily create AJV instance
      if (!ajvRef.current) {
        ajvRef.current = createAjv();
      }

      // Recompile only when schema identity changes
      if (compiledSchemaRef.current?.schema !== jsonSchema) {
        try {
          compiledSchemaRef.current = {
            schema: jsonSchema,
            validate: ajvRef.current.compile(jsonSchema),
          };
        } catch (compileErr) {
          const message =
            compileErr instanceof Error
              ? compileErr.message
              : String(compileErr);
          if (message.includes("can't resolve reference")) {
            // eslint-disable-next-line no-console
            console.warn(
              'Schema validation skipped due to unresolved $ref:',
              message,
            );
            compiledSchemaRef.current = { schema: jsonSchema, validate: null };
          } else {
            return [`Validation error: ${message}`];
          }
        }
      }

      const validate = compiledSchemaRef.current?.validate;
      if (!validate) {
        return [];
      }

      const valid = validate(mergedValues);
      if (!valid && validate.errors) {
        return validate.errors.map(error => {
          const path = error.instancePath || '/';
          const message = error.message || 'Validation error';
          return `${path}: ${message}`;
        });
      }

      return [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return [`Validation error: ${message}`];
    }
  }, [mergedValues, jsonSchema]);

  return { warnings };
}
