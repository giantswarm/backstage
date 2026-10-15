// `@material-ui/core` exports that have a `@backstage/ui` (bui) equivalent. MUI
// v4 is legacy here: new and edited UI code imports from bui. The swap table
// and the closed list of cases where a legacy import is still correct live in
// `docs/ui.md` and the `ui` Claude Code skill.
//
// Note: `no-restricted-imports` keeps only one entry per module name, so this
// has to be a single `paths` entry with every name and one shared message —
// hence the swap table lives in the docs rather than in per-name messages.
const muiWithBuiEquivalent = [
  'Accordion',
  'AccordionDetails',
  'AccordionSummary',
  'Avatar',
  'Badge',
  'Box',
  'Button',
  'ButtonGroup',
  'Card',
  'CardActions',
  'CardContent',
  'CardHeader',
  'Checkbox',
  'Chip',
  'CircularProgress',
  'Container',
  'Dialog',
  'DialogActions',
  'DialogContent',
  'DialogContentText',
  'DialogTitle',
  'ExpansionPanel',
  'ExpansionPanelDetails',
  'ExpansionPanelSummary',
  'FormControl',
  'FormControlLabel',
  'FormGroup',
  'FormHelperText',
  'FormLabel',
  'Grid',
  'IconButton',
  'Input',
  'InputBase',
  'InputLabel',
  'LinearProgress',
  'Link',
  'List',
  'ListItem',
  'ListItemIcon',
  'ListItemSecondaryAction',
  'ListItemText',
  'Menu',
  'MenuItem',
  'Paper',
  'Popover',
  'Radio',
  'RadioGroup',
  'Select',
  'Slider',
  'Snackbar',
  'Switch',
  'Tab',
  'Table',
  'TableBody',
  'TableCell',
  'TableHead',
  'TableRow',
  'Tabs',
  'TextField',
  'Tooltip',
  'Typography',
];

const preferBuiMessage =
  'MUI v4 is legacy — use the bui (@backstage/ui) equivalent. Swap table, and ' +
  'the cases where a legacy import is still correct: docs/ui.md, ' +
  '"What to reach for instead of MUI".';

const trackedMutationMessage =
  'Use useTrackedMutation from @giantswarm/backstage-plugin-analytics-react: ' +
  'it reports the write as a portal action, or takes `event: null` with an ' +
  '`untrackedReason`. docs/telemetry.md, "For developers".';

const shellPathMessage =
  'Do not write an Agent Platform shell path by hand: link through a route ' +
  'ref, an external route ref the app binds, or a helper built on one ' +
  '(useCustomizePaths, useSkillPaths, useServerPageLinks…). ' +
  'giantswarm/giantswarm#38510.';

// A string, or the first part of a template, that starts with one of the
// shell's URL roots, followed by a path, a query, a fragment or nothing. A
// later template part follows an expression, such as a route ref's base, so
// it is not a path written by hand. `\x2F` is a `/`: esquery ends a regular
// expression at the first `/`, even an escaped one.
const shellPathPattern = '/^\\x2F(agent-platform|customize)(\\x2F|\\?|#|$)/';

module.exports = {
  root: true,
  plugins: ['giantswarm'],
  overrides: [
    {
      // An error, unlike the MUI rule below: a write in a plugin is a tracked
      // portal action or a deliberate opt-out, never forgotten.
      files: ['plugins/*/src/**/*.ts?(x)'],
      excludedFiles: ['plugins/analytics-react/**'],
      rules: {
        'giantswarm/no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '@tanstack/react-query',
                importNames: ['useMutation'],
                message: trackedMutationMessage,
              },
            ],
          },
        ],
      },
    },
    {
      // Shell paths resolve through route refs, so the cut-over that moves
      // them changes route definitions only. A route definition itself, and
      // the shell's own list of its roots, carry a disable comment with the
      // reason. A bare `'/'` (the shell's home) can't be told apart from
      // other uses, so it is not checked.
      files: [
        'plugins/*/src/**/*.ts?(x)',
        'packages/app/src/modules/**/*.ts?(x)',
      ],
      excludedFiles: [
        '**/*.test.ts?(x)',
        '**/*.stories.tsx',
        '**/setupTests.ts',
        '**/__fixtures__/**',
        '**/fixtures/**',
        '**/testUtils/**',
        '**/testing/**',
        '**/*Fixtures.ts',
      ],
      rules: {
        'giantswarm/no-restricted-syntax': [
          'error',
          {
            selector: `Literal[value=${shellPathPattern}]`,
            message: shellPathMessage,
          },
          {
            selector: `TemplateLiteral > TemplateElement:first-child[value.raw=${shellPathPattern}]`,
            message: shellPathMessage,
          },
        ],
      },
    },
    {
      files: ['**/*.ts?(x)'],
      rules: {
        // A different rule id from the `no-restricted-imports` that
        // @backstage/cli's eslint-factory configures per package, so this adds
        // to it rather than replacing it. Warn, not error: the MUI imports
        // already in the tree are migration debt, and `yarn lint` only covers
        // the packages you changed.
        '@typescript-eslint/no-restricted-imports': [
          'warn',
          {
            paths: [
              {
                name: '@material-ui/core',
                importNames: muiWithBuiEquivalent,
                message: preferBuiMessage,
              },
            ],
          },
        ],
      },
    },
  ],
};
