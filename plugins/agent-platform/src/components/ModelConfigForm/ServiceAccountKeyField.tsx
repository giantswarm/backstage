import { useRef, useState, type ChangeEvent } from 'react';
import { Button, Flex, Text } from '@backstage/ui';

import { SecretTextField } from './SecretTextField';

export type ServiceAccountKeyFieldProps = {
  value: string;
  onChange: (value: string) => void;
  isRequired: boolean;
  placeholder?: string;
  description: string;
  error?: string;
};

/**
 * A Google Cloud service account key: pasted into a masked field, or read
 * from the JSON file Google Cloud downloads. The file's contents land in the
 * same field, so both paths are validated and saved alike.
 */
export function ServiceAccountKeyField({
  value,
  onChange,
  isRequired,
  placeholder,
  description,
  error,
}: ServiceAccountKeyFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [loadedFile, setLoadedFile] = useState<string>();
  const [readError, setReadError] = useState<string>();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file chosen twice still fires a change.
    event.target.value = '';
    if (!file) {
      return;
    }
    try {
      onChange(await file.text());
      setLoadedFile(file.name);
      setReadError(undefined);
    } catch {
      setLoadedFile(undefined);
      setReadError(`Could not read ${file.name}. Choose the file again.`);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <SecretTextField
        label="Service account key"
        secondaryLabel={isRequired ? undefined : 'optional'}
        value={value}
        onChange={next => {
          setLoadedFile(undefined);
          onChange(next);
        }}
        placeholder={placeholder}
        description={description}
        error={error ?? readError}
      />
      <Flex align="center" gap="2">
        <Button
          variant="secondary"
          size="small"
          onPress={() => fileInput.current?.click()}
        >
          Choose key file
        </Button>
        {loadedFile && (
          <Text
            variant="body-small"
            color="secondary"
            role="status"
            style={{ overflowWrap: 'anywhere' }}
          >
            Read from {loadedFile}
          </Text>
        )}
      </Flex>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        aria-label="Service account key file"
        hidden
        onChange={onFile}
      />
    </Flex>
  );
}
