import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { parseEntityRef } from '@backstage/catalog-model';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { JsonValue } from '@backstage/types';

// Helper function for type validation
function validateType(value: JsonValue, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return (
        typeof value === 'object' && value !== null && !Array.isArray(value)
      );
    default:
      return true; // Unknown type, assume valid
  }
}

interface CreateValidateTemplateValuesActionOptions {
  catalog: CatalogService;
  actionsRegistry: ActionsRegistryService;
}

export function createValidateTemplateValuesAction({
  catalog,
  actionsRegistry,
}: CreateValidateTemplateValuesActionOptions) {
  actionsRegistry.register({
    name: 'validate-template-values',
    title: 'Validate Template Values',
    description:
      "Check if your input values meet the template's parameter requirements before execution",
    schema: {
      input: zodSchema =>
        zodSchema.object({
          templateRef: zodSchema
            .string()
            .describe(
              'Template reference (e.g., "template:default/my-template")',
            ),
          values: zodSchema
            .record(zodSchema.unknown())
            .describe('Parameter values to validate'),
        }),
      output: zodSchema =>
        zodSchema.object({
          valid: zodSchema.boolean().describe('Whether the values are valid'),
          errors: zodSchema
            .array(zodSchema.string())
            .describe('List of validation errors'),
          schema: zodSchema
            .record(zodSchema.unknown())
            .describe('The template parameter schema'),
        }),
    },
    attributes: {
      readOnly: true,
      idempotent: true,
      destructive: false,
    },
    action: async ({ input, logger, credentials }) => {
      logger.info(`Validating template values for: ${input.templateRef}`);

      try {
        // Parse the template reference
        const entityRef = parseEntityRef(input.templateRef);

        // Get the template entity from the catalog
        const entity = await catalog.getEntityByRef(entityRef, { credentials });

        if (!entity) {
          throw new Error(`Template not found: ${input.templateRef}`);
        }

        if (entity.kind !== 'Template') {
          throw new Error(
            `Entity is not a template: ${input.templateRef} (kind: ${entity.kind})`,
          );
        }

        // Extract template parameters from the spec
        const templateSpec = entity.spec as any;
        const parameters = templateSpec?.parameters || [];

        // Create a simplified schema representation
        const schema: Record<string, any> = {};
        const errors: string[] = [];
        let valid = true;

        // Validate each parameter
        for (const param of parameters) {
          if (typeof param === 'object' && param.properties) {
            // Handle parameter objects with properties
            for (const [key, propDef] of Object.entries(param.properties)) {
              const propDefAny = propDef as any;
              schema[key] = propDefAny;

              // Check if required and missing
              if (param.required?.includes(key) && !(key in input.values)) {
                errors.push(`Missing required parameter: ${key}`);
                valid = false;
              }

              // Check type validation if value is provided
              if (key in input.values) {
                const value = input.values[key] as JsonValue;
                const expectedType = propDefAny.type;

                if (expectedType && !validateType(value, expectedType)) {
                  errors.push(
                    `Parameter '${key}' has invalid type. Expected: ${expectedType}, got: ${typeof value}`,
                  );
                  valid = false;
                }

                // Check enum values
                if (propDefAny.enum && !propDefAny.enum.includes(value)) {
                  errors.push(
                    `Parameter '${key}' has invalid value. Must be one of: ${propDefAny.enum.join(', ')}`,
                  );
                  valid = false;
                }
              }
            }
          } else if (typeof param === 'string') {
            // Handle simple string parameters
            schema[param] = { type: 'string' };
            if (!(param in input.values)) {
              errors.push(`Missing parameter: ${param}`);
              valid = false;
            }
          }
        }

        logger.info(
          `Template validation completed for ${input.templateRef}. Valid: ${valid}`,
        );

        return {
          output: {
            valid,
            errors,
            schema,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error('Failed to validate template values', {
          error: errorMessage,
        });
        throw new Error(`Failed to validate template values: ${errorMessage}`);
      }
    },
  });
}
