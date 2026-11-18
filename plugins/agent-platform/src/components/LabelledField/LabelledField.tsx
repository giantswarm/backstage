import type { ReactNode } from 'react';
import { FieldLabel, Flex } from '@backstage/ui';

/**
 * A field's label and description over what it holds where no bui control
 * carries them (a note, a loading line, a sole value): the model picker's
 * `FieldLabel`, so it reads like every other field on the form.
 */
export function LabelledField({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap="2">
      <FieldLabel label={label} description={description} />
      {children}
    </Flex>
  );
}
