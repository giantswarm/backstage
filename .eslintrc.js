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

module.exports = {
  root: true,
  overrides: [
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
