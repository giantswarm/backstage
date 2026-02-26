import { useTheme } from '@material-ui/core';
import LightAsync from 'react-syntax-highlighter/dist/esm/light-async';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import stackoverflowDark from 'react-syntax-highlighter/dist/esm/styles/hljs/stackoverflow-dark';
import stackoverflowLight from 'react-syntax-highlighter/dist/esm/styles/hljs/stackoverflow-light';

LightAsync.registerLanguage('json', json);

export function JsonHighlight({
  children,
  customStyle,
  codeTagProps,
}: {
  children: string;
  customStyle?: React.CSSProperties;
  codeTagProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const theme = useTheme();
  const style =
    theme.palette.type === 'dark' ? stackoverflowDark : stackoverflowLight;

  return (
    <LightAsync
      language="json"
      style={style}
      wrapLongLines
      customStyle={customStyle}
      codeTagProps={codeTagProps}
    >
      {children}
    </LightAsync>
  );
}
