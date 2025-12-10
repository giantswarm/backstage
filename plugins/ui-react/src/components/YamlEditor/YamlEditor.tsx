import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  drawSelection,
  keymap,
  highlightActiveLineGutter,
  gutter,
} from '@codemirror/view';
import { lintKeymap, lintGutter } from '@codemirror/lint';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete';
import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
import { yamlSchema } from 'codemirror-json-schema/yaml';
import { updateSchema } from 'codemirror-json-schema';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';

const vsCodeLightBackgroundColor = '#ffffff';
const vsCodeDarkBackgroundColor = '#1e1e1e';

const useStyles = makeStyles(theme => ({
  editorWrapper: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor:
      theme.palette.type === 'light'
        ? vsCodeLightBackgroundColor
        : vsCodeDarkBackgroundColor,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
    height: '100%',
    minHeight: '144px',
  },
  editorWrapperError: {
    borderColor: theme.palette.error.main,
  },
}));

type YamlEditorProps = {
  initialValue?: string;
  schema?: any;
  onChange?: (value: string) => void;
  height?: string;
  theme?: 'light' | 'dark';
  error?: boolean;
  readOnly?: boolean;
};

export const YamlEditor = ({
  initialValue = '',
  schema = null,
  onChange = () => {},
  height = 'auto',
  theme = 'light',
  error = false,
  readOnly = false,
}: YamlEditorProps) => {
  const classes = useStyles();
  const editorRef = useRef(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const commonExtensions = [
      gutter({ class: 'CodeMirror-lint-markers' }),
      bracketMatching(),
      highlightActiveLineGutter(),
      closeBrackets(),
      history(),
      autocompletion(),
      lineNumbers(),
      lintGutter(),
      indentOnInput(),
      drawSelection(),
      foldGutter(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
        indentWithTab,
      ]),
      EditorState.readOnly.of(readOnly),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      EditorView.updateListener.of(update => {
        if (update.docChanged && onChangeRef.current && !readOnly) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    // Create editor state with YAML schema support
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        commonExtensions,
        schema ? yamlSchema(schema) : yamlSchema({}),
        theme === 'light' ? vsCodeLight : vsCodeDark,
      ],
    });

    // Create editor view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Cleanup on unmount
    // eslint-disable-next-line consistent-return
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update schema when it changes
  useEffect(() => {
    if (viewRef.current && schema) {
      updateSchema(viewRef.current, schema);
    }
  }, [schema]);

  return (
    <div
      className={classNames(
        classes.editorWrapper,
        error && classes.editorWrapperError,
      )}
    >
      <div ref={editorRef} style={{ maxHeight: height, overflow: 'auto' }} />
    </div>
  );
};
