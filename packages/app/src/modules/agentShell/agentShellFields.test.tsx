// This test reads the stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { render } from '@testing-library/react';
import {
  Combobox,
  DatePicker,
  FieldLabel,
  NumberField,
  PasswordField,
  SearchField,
  Select,
  TextAreaField,
  TextField,
} from '@backstage/ui';
import { agentShellLightColors } from './theme';

const shellCss = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');

/** The field tokens agent-shell.css defines, by the palette role they repeat. */
const FIELD_TOKENS = {
  '--agent-shell-input-bg': agentShellLightColors.inputBackground,
  '--agent-shell-input-border': agentShellLightColors.inputBorder,
  '--agent-shell-input-border-hover': agentShellLightColors.inputBorderHover,
  '--agent-shell-input-focus-border': agentShellLightColors.inputFocusBorder,
  '--agent-shell-input-focus-halo': agentShellLightColors.inputFocusHalo,
};

/** The bui field boxes the stylesheet gives an edge to. */
const FIELD_BOX_CLASSES = [
  'bui-Input',
  'bui-PasswordFieldInput',
  'bui-TextArea',
  'bui-SearchFieldInputWrapper',
  'bui-SelectTrigger',
  'bui-ComboboxInput',
  'bui-DatePickerGroup',
];

describe('agent-shell.css form fields', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-agent-shell');
    document.body.removeAttribute('data-theme-mode');
    document.head.innerHTML = '';
  });

  it('defines the field tokens on the shell body', () => {
    const style = document.createElement('style');
    style.textContent = shellCss;
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-agent-shell', '');
    document.body.setAttribute('data-theme-mode', 'light');

    const computed = getComputedStyle(document.body);
    // jsdom serialises `rgba(0, 159, 255, 0.15)` without its spaces.
    const squeeze = (value: string) => value.replace(/\s+/g, '');
    for (const [token, value] of Object.entries(FIELD_TOKENS)) {
      expect([token, squeeze(computed.getPropertyValue(token))]).toEqual([
        token,
        squeeze(value),
      ]);
    }
    expect(computed.getPropertyValue('--agent-shell-input-radius').trim()).toBe(
      '10px',
    );
  });

  it('targets class names the installed bui fields carry', () => {
    // A renamed class in a bui upgrade would silently drop the edge again.
    const { container } = render(
      <>
        <TextField label="Text" />
        <NumberField label="Number" />
        <PasswordField label="Password" />
        <TextAreaField label="Long text" />
        <SearchField aria-label="Search" />
        <Select label="Pick" options={[{ value: 'a', label: 'A' }]} />
        <Combobox label="Find" options={[{ value: 'a', label: 'A' }]} />
        <DatePicker label="Date" />
        <FieldLabel label="Hand-rolled" htmlFor="hand-rolled" />
      </>,
    );

    for (const className of [...FIELD_BOX_CLASSES, 'bui-FieldLabelWrapper']) {
      expect(shellCss).toContain(`.${className}`);
      expect([
        className,
        container.getElementsByClassName(className).length,
      ]).not.toEqual([className, 0]);
    }
  });
});
