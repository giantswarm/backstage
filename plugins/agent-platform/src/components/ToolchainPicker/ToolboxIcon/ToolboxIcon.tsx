import { SvgIcon, type SvgIconProps } from '@material-ui/core';

/**
 * A toolbox, drawn as an outline to match the composer's other icons (the
 * workspace's folder): the tools a session brings along, whether they are
 * CLIs, SDKs or language runtimes. `@material-ui/icons` v4 has no toolbox.
 */
export function ToolboxIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8" />
        <rect x={3} y={8} width={18} height={11} rx={2} />
        <path d="M3 13h7M14 13h7" />
        <rect x={10} y={11.5} width={4} height={3} rx={0.75} />
      </g>
    </SvgIcon>
  );
}
