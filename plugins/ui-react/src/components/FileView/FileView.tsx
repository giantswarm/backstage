import { Flex, Text } from '@backstage/ui';
import { makeStyles, useTheme } from '@material-ui/core';
import CodeIcon from '@material-ui/icons/Code';
import { CopyButton } from '../CopyButton';
import { YamlEditor } from '../YamlEditor';

const useStyles = makeStyles(theme => ({
  header: {
    minWidth: 0,
    marginBottom: theme.spacing(0.75),
  },
  path: {
    fontFamily: 'monospace',
    color: theme.palette.text.secondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  icon: {
    flexShrink: 0,
    color: theme.palette.text.secondary,
  },
  pre: {
    margin: 0,
    padding: theme.spacing(1.5),
    overflowX: 'auto',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    lineHeight: 1.5,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
  },
}));

export type FileViewProps = {
  content: string;
  /** File name shown in the header (with a file icon). */
  filename?: string;
  /** Secondary muted path shown after the filename. */
  path?: string;
  /** 'yaml' renders a read-only CodeMirror viewer; otherwise a plain code block. */
  language?: 'yaml' | 'text';
};

/**
 * A read-only view of a file: a header with a file icon, the file name, an
 * optional muted path and a copy button, above the content. YAML renders in a
 * read-only `YamlEditor` (capped at 520px, scrolling inside); anything else in
 * a plain block that scrolls sideways. For a command or a log, which is not a
 * file, use `CodeBlock`.
 */
export function FileView({
  content,
  filename,
  path,
  language = 'text',
}: FileViewProps) {
  const classes = useStyles();
  const theme = useTheme();

  return (
    <div>
      <Flex align="center" justify="between" gap="2" className={classes.header}>
        <Flex align="center" gap="1" style={{ minWidth: 0 }}>
          <CodeIcon fontSize="small" className={classes.icon} />
          {filename && (
            <Text variant="body-small" weight="bold">
              {filename}
            </Text>
          )}
          {path && (
            <Text variant="body-small" className={classes.path}>
              {path}
            </Text>
          )}
        </Flex>
        <CopyButton text={content} size="compact" />
      </Flex>

      {language === 'yaml' ? (
        <YamlEditor
          initialValue={content}
          readOnly
          theme={theme.palette.type}
          maxHeight="520px"
        />
      ) : (
        <pre className={classes.pre}>{content}</pre>
      )}
    </div>
  );
}
