declare module 'react-syntax-highlighter/dist/esm/light-async' {
  import { ComponentType } from 'react';

  interface SyntaxHighlighterProps {
    language?: string;
    style?: Record<string, React.CSSProperties>;
    children?: string;
    customStyle?: React.CSSProperties;
    codeTagProps?: React.HTMLAttributes<HTMLElement>;
    wrapLongLines?: boolean;
    showLineNumbers?: boolean;
    [key: string]: unknown;
  }

  const LightAsync: ComponentType<SyntaxHighlighterProps> & {
    registerLanguage: (name: string, language: unknown) => void;
  };

  export default LightAsync;
}

declare module 'react-syntax-highlighter/dist/esm/languages/hljs/json' {
  const language: unknown;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/styles/hljs/*' {
  const style: Record<string, React.CSSProperties>;
  export default style;
}
