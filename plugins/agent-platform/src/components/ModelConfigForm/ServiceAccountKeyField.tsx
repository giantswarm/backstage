import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { Button, FieldLabel, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { FieldErrorText } from '@giantswarm/backstage-plugin-ui-react';

import { serviceAccountKeySummary } from '../../lib/modelConfigs';

/** A service account key is about 2.3 KB; anything far larger is another file. */
const MAX_KEY_FILE_BYTES = 64 * 1024;

const useStyles = makeStyles({
  zone: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-3)',
    borderRadius: 'var(--agent-shell-input-radius, var(--bui-radius-3))',
    border: '1px dashed var(--agent-shell-input-border, var(--bui-border-1))',
    background: 'var(--agent-shell-input-bg, var(--bui-bg-neutral-1))',
  },
  dragging: {
    borderStyle: 'solid',
    borderColor: 'var(--agent-shell-input-focus-border, var(--bui-ring))',
  },
  invalid: {
    borderStyle: 'solid',
    borderColor: 'var(--bui-negative-border)',
  },
  fact: {
    overflowWrap: 'anywhere',
  },
});

export type ServiceAccountKeyFieldProps = {
  /** The key file's text, or empty for none chosen. */
  value: string;
  onChange: (value: string) => void;
  isRequired: boolean;
  description: string;
  /**
   * Edit only: the project of the key the model already has, kept while no
   * file is chosen.
   */
  storedKeyProject?: string;
  /** The problem the field shows now, if any. */
  error?: string;
};

/**
 * A Google Cloud service account key, read from the JSON file Google Cloud
 * downloads: chosen, or dropped on the field. The key itself is never shown;
 * the field says which account and project the file names, so the person can
 * tell they picked the right one.
 */
export function ServiceAccountKeyField({
  value,
  onChange,
  isRequired,
  description,
  storedKeyProject,
  error,
}: ServiceAccountKeyFieldProps) {
  const classes = useStyles();
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>();
  const [readError, setReadError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const shownError = readError ?? error;
  const summary = value ? serviceAccountKeySummary(value) : undefined;

  const read = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (file.size > MAX_KEY_FILE_BYTES) {
      setFileName(undefined);
      setReadError(
        `${file.name} is too large to be a service account key. Choose the JSON key file Google Cloud downloads.`,
      );
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setReadError(undefined);
      onChange(text);
    } catch {
      setFileName(undefined);
      setReadError(`Could not read ${file.name}. Choose the file again.`);
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file chosen twice still fires a change.
    event.target.value = '';
    void read(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void read(event.dataTransfer.files?.[0]);
  };

  const clear = () => {
    setFileName(undefined);
    setReadError(undefined);
    onChange('');
  };

  let chooseLabel = 'Choose key file';
  if (value) {
    chooseLabel = 'Choose another file';
  } else if (storedKeyProject) {
    chooseLabel = 'Replace key file';
  }

  return (
    <Flex direction="column" gap="2">
      {/* A label for a group, not for the button: the button keeps its own
          name, which says what it does. */}
      <FieldLabel
        id={labelId}
        label="Service account key"
        secondaryLabel={isRequired ? undefined : 'optional'}
        description={description}
        descriptionId={descriptionId}
      />
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className={[
          classes.zone,
          dragging ? classes.dragging : '',
          shownError ? classes.invalid : '',
        ].join(' ')}
        data-invalid={shownError ? true : undefined}
        onDragOver={event => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div role="status">
          {value && summary && (
            <Flex direction="column" gap="1">
              {fileName && (
                <Text variant="body-medium" className={classes.fact}>
                  Read from {fileName}.
                </Text>
              )}
              {summary.clientEmail && (
                <Text
                  variant="body-small"
                  color="secondary"
                  className={classes.fact}
                >
                  Service account {summary.clientEmail}
                </Text>
              )}
              {summary.projectID && (
                <Text
                  variant="body-small"
                  color="secondary"
                  className={classes.fact}
                >
                  Project {summary.projectID}
                </Text>
              )}
            </Flex>
          )}
          {!value && storedKeyProject && (
            <Text
              variant="body-small"
              color="secondary"
              className={classes.fact}
            >
              The stored key of project {storedKeyProject} is kept.
            </Text>
          )}
        </div>
        <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="small"
            aria-describedby={shownError ? errorId : undefined}
            onPress={() => fileInput.current?.click()}
          >
            {chooseLabel}
          </Button>
          {value ? (
            <Button variant="tertiary" size="small" onPress={clear}>
              {storedKeyProject ? 'Keep the stored key' : 'Remove file'}
            </Button>
          ) : (
            <Text variant="body-small" color="secondary">
              or drop the JSON file here.
            </Text>
          )}
        </Flex>
      </div>
      {shownError && <FieldErrorText id={errorId}>{shownError}</FieldErrorText>}
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
