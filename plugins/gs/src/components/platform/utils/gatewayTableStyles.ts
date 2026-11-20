import { makeStyles } from '@material-ui/core';

/** The Gateways tab's tables. bui's Table has no props for these. */
export const useGatewayTableStyles = makeStyles({
  table: {
    // Every cell at the top of its row: hostnames, backends and statuses
    // run to several lines, and the row is read from its first.
    '& td, & th': {
      verticalAlign: 'top',
    },
    // The selected Gateway's row, found by its pressed button.
    '& tr:has([aria-pressed="true"])': {
      backgroundColor: 'var(--bui-bg-neutral-2)',
    },
  },
  // A row the search found, found by the mark in it: a lighter tint than
  // the mark's, so the mark stays visible in it.
  marksRows: {
    '& tr:has(mark)': {
      backgroundColor:
        'color-mix(in srgb, var(--bui-warning-bg-subdued) 35%, transparent)',
    },
    '& tr:has(mark) mark': {
      fontWeight: 500,
    },
  },
  // A policy that targets the route, under its name.
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1)',
    margin: 'var(--bui-space-1) 0 0',
    padding: 0,
    listStyle: 'none',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 20,
    maxWidth: '100%',
    boxSizing: 'border-box',
    paddingInline: 'var(--bui-space-2)',
    borderRadius: 'var(--bui-radius-2)',
    backgroundColor: 'var(--bui-bg-neutral-2)',
    color: 'var(--bui-fg-secondary)',
    fontSize: 'var(--bui-font-size-2)',
    overflowWrap: 'anywhere',
  },
  // A section's count beside its heading, as the tab strip draws counts.
  count: {
    display: 'inline-flex',
    alignItems: 'center',
    paddingInline: 7,
    borderRadius: 'var(--bui-radius-full, 999px)',
    backgroundColor: 'var(--bui-bg-neutral-2)',
    color: 'var(--bui-fg-secondary)',
    fontSize: 'var(--bui-font-size-2)',
    fontWeight: 400,
  },
  mono: {
    fontFamily: 'var(--bui-font-monospace, monospace)',
    fontSize: 'var(--bui-font-size-2)',
    overflowWrap: 'anywhere',
  },
  // The Gateway's name: a button that selects it, drawn as the shell's
  // links are, as the node pools table's names are.
  select: {
    border: 0,
    background: 'transparent',
    padding: 0,
    font: 'inherit',
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--agent-shell-link, var(--bui-fg-primary))',
    textDecorationLine: 'underline',
    textDecorationThickness: 1,
    textUnderlineOffset: '0.15em',
    overflowWrap: 'anywhere',
    '&:hover': {
      color: 'var(--agent-shell-link-hover, var(--bui-fg-primary))',
      textDecorationThickness: 2,
    },
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
      borderRadius: 2,
    },
  },
});
