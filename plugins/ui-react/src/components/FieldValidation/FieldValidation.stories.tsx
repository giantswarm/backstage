import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Flex, Select, TextField } from '@backstage/ui';
import { TextAreaField } from '../TextAreaField';
import {
  FieldErrorText,
  FIELD_VALIDATION_SCOPE_ATTRIBUTE,
  useFieldValidation,
  useSelectFieldError,
} from './FieldValidation';
import { componentDocs } from '../../storybook/docs';

function nameProblem(name: string): string | undefined {
  if (!name.trim()) {
    return 'Enter a name';
  }
  return /^[a-z][a-z0-9-]*$/.test(name)
    ? undefined
    : 'Use lowercase letters, numbers and hyphens, starting with a letter';
}

/**
 * A form that checks each field when the person leaves it, keeps a shown
 * error in step with each change until it is fixed, and on a blocked submit
 * shows every error and focuses the first invalid field.
 */
function Form() {
  const [region, setRegion] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const validation = useFieldValidation();
  const errors = {
    region: region ? undefined : 'Choose a region',
    name: nameProblem(name),
    notes: notes.trim() ? undefined : 'Enter a note for the reviewers',
  };
  const isValid = !errors.region && !errors.name && !errors.notes;
  const regionError = useSelectFieldError(
    validation.errorFor('region', errors.region),
  );

  return (
    <Flex
      direction="column"
      gap="3"
      style={{ maxWidth: 420 }}
      {...{ [FIELD_VALIDATION_SCOPE_ATTRIBUTE]: '' }}
    >
      <Select
        label="Region"
        options={[
          { id: 'eu', label: 'Europe' },
          { id: 'us', label: 'United States' },
        ]}
        selectedKey={region ?? null}
        onSelectionChange={key => setRegion(key ? String(key) : undefined)}
        {...regionError.selectProps}
      />
      {regionError.message}
      <TextField
        label="Name"
        description="Lowercase letters, numbers and hyphens."
        value={name}
        onChange={setName}
        {...validation.textFieldProps('name', errors.name)}
      />
      <TextAreaField
        label="Notes"
        value={notes}
        onChange={setNotes}
        {...validation.fieldProps('notes', errors.notes)}
      />
      <Flex>
        <Button
          onPress={() => (isValid ? validation.reset() : validation.reveal())}
        >
          Continue
        </Button>
      </Flex>
    </Flex>
  );
}

const meta = {
  title: 'Components/FieldValidation',
  component: FieldErrorText,
  tags: ['autodocs'],
  args: { id: 'error', children: 'Name is required' },
  render: () => <Form />,
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Field errors that appear when a person leaves a field they typed in, or tries to submit — never while they first type: `useFieldValidation` holds that state per field, keeps a shown error in step with each change so it clears the moment it is fixed, and focuses the first invalid field on a blocked submit; its `textFieldProps` and `fieldProps` wire a field, `fieldErrorProps` and `useSelectFieldError` put a message on a bui field, and `FieldErrorText` renders one for a field bui does not cover. The rules are in the `forms` skill.',
          whenToUse:
            'In any create or edit form with required or validated fields. Type "1" in Name and press Tab to see the error appear on leaving; type a letter to see it clear. Tab through an empty field: it stays quiet. Press Continue with the form empty to see every error appear and the focus move to the first one.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof FieldErrorText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnBlurAndSubmit: Story = {};
