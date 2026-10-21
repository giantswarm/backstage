import {
  TechnicalDetailsFoldOut,
  YamlEditorFormField,
} from '@giantswarm/backstage-plugin-ui-react';
import type { JsonSchema } from '../../../apis';
import { RESULT_MAX_HEIGHT } from '../ToolResultViewer';

/**
 * A tool's input schema as muster describes it, folded in place and boxed as
 * the other pages' Technical details: the run form is the schema drawn for
 * people. Opened, it is as tall as a result may be.
 */
export function InputSchemaFoldOut({ schema }: { schema: JsonSchema }) {
  return (
    <TechnicalDetailsFoldOut title="Input schema" defaultExpanded={false}>
      <YamlEditorFormField
        value={JSON.stringify(schema, null, 2)}
        language="json"
        readOnly
        maxHeight={RESULT_MAX_HEIGHT}
      />
    </TechnicalDetailsFoldOut>
  );
}
