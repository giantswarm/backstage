import { z } from 'zod';
import { makeFieldSchemaFromZod } from '@backstage/plugin-scaffolder';

export const ClusterPickerFieldSchema = makeFieldSchemaFromZod(z.string());

export const ClusterPickerSchema = ClusterPickerFieldSchema.schema;

export type ClusterPickerProps = typeof ClusterPickerFieldSchema.type;
