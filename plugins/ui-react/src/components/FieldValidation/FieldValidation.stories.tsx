import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Flex, Select, TextField } from '@backstage/ui';
import { TextAreaField } from '../TextAreaField';
import {
  FieldErrorText,
  FIELD_VALIDATION_SCOPE_ATTRIBUTE,
  fieldErrorProps,
  useFieldValidation,
  useSelectFieldError,
} from './FieldValidation';
import { componentDocs } from '../../storybook/docs';

/**
 * A form that shows its field errors only once a submit is attempted, then
 * focuses the first invalid field.
 */
function Form() {
  const [region, setRegion] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const validation = useFieldValidation();
  const errors = {
    region: region ? undefined : 'Select a region',
    name: name.trim() ? undefined : 'Name is required',
    notes: notes.trim() ? undefined : 'Notes are required',
  };
  const isValid = !errors.region && !errors.name && !errors.notes;
  const regionError = useSelectFieldError(validation.errorFor(errors.region));

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
        value={name}
        onChange={setName}
        {...fieldErrorProps(validation.errorFor(errors.name))}
      />
      <TextAreaField
        label="Notes"
        value={notes}
        onChange={setNotes}
        error={validation.errorFor(errors.notes)}
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
            'Field errors that appear on the first submit attempt, not while a person is still typing: `useFieldValidation` holds that state and focuses the first invalid field, `fieldErrorProps` and `useSelectFieldError` put a message on a bui field, and `FieldErrorText` renders one for a field bui does not cover.',
          whenToUse:
            'In any create or edit form with required or validated fields. Press Continue with the form empty to see the errors appear and the focus move to the first one.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof FieldErrorText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnFirstAttempt: Story = {};
