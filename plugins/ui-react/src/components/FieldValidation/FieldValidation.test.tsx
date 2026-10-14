import { useMemo, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, TextField } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { TextAreaField } from '../TextAreaField';
import { WizardFrame } from '../WizardFrame';
import {
  fieldErrorProps,
  focusFirstInvalidField,
  useFieldValidation,
  useSelectFieldError,
} from './FieldValidation';

function Form({ onContinue }: { onContinue: () => void }) {
  const [region, setRegion] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const validation = useFieldValidation();
  const errors = {
    region: region ? undefined : 'Select a region',
    name: name.trim() ? undefined : 'Name is required',
    notes: notes.trim() ? undefined : 'Notes are required',
  };
  const isValid = !errors.region && !errors.name && !errors.notes;
  const regionError = useSelectFieldError(validation.errorFor(errors.region));
  const { reveal } = validation;
  const actions = useMemo(
    () => (
      <button onClick={() => (isValid ? onContinue() : reveal())}>
        Continue
      </button>
    ),
    [isValid, onContinue, reveal],
  );
  useProvidePageHeaderActions(actions);

  return (
    <WizardFrame title="New thing" closeHref="/things">
      <TextField label="Unvalidated" />
      <Select
        label="Region"
        options={[{ id: 'eu', label: 'Europe' }]}
        selectedKey={region ?? null}
        onSelectionChange={key => setRegion(key ? String(key) : undefined)}
        {...regionError.selectProps}
      />
      {regionError.message}
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        {...fieldErrorProps(validation.errorFor(errors.name))}
      />
      <TextAreaField
        label="Notes"
        value={notes}
        onChange={setNotes}
        error={validation.errorFor(errors.notes)}
      />
    </WizardFrame>
  );
}

function renderForm() {
  const onContinue = jest.fn();
  render(
    <MemoryRouter>
      <PageHeaderActionsProvider>
        <Form onContinue={onContinue} />
      </PageHeaderActionsProvider>
    </MemoryRouter>,
  );
  return { onContinue };
}

function describedText(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

describe('field validation', () => {
  it('stays quiet until the first blocked attempt', () => {
    renderForm();

    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('marks each invalid field with its message and focuses the first one', async () => {
    const { onContinue } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onContinue).not.toHaveBeenCalled();
    const name = screen.getByRole('textbox', { name: /Name/ });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(name)).toContain('Name is required');
    const notes = screen.getByRole('textbox', { name: /Notes/ });
    expect(notes).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(notes)).toContain('Notes are required');
    const region = screen.getByRole('button', { name: /Region/ });
    expect(describedText(region)).toContain('Select a region');
    // The unvalidated field stays as it was.
    expect(
      screen.getByRole('textbox', { name: /Unvalidated/ }),
    ).not.toHaveAttribute('aria-invalid');

    // Focus lands on the Select's trigger, the first invalid field — not on
    // react-aria's hidden native select that mirrors it.
    expect(region).toHaveFocus();
  });

  it('clears a field’s error as soon as it is fixed and moves on to the next', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await userEvent.type(
      screen.getByRole('textbox', { name: /Name/ }),
      'Support',
    );
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).not.toHaveAttribute(
      'aria-invalid',
    );

    await userEvent.click(screen.getByRole('button', { name: /Region/ }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Europe' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('textbox', { name: /Notes/ })).toHaveFocus();
  });

  it('continues once every field is valid', async () => {
    const { onContinue } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: /Region/ }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Europe' }),
    );
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'x');
    await userEvent.type(screen.getByRole('textbox', { name: /Notes/ }), 'y');
    const footer = screen.getByRole('contentinfo');
    await userEvent.click(
      within(footer).getByRole('button', { name: 'Continue' }),
    );

    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

describe('useFieldValidation in a scope of its own', () => {
  function ScopedForm() {
    const scope = useRef<HTMLDivElement>(null);
    const [name, setName] = useState('');
    const validation = useFieldValidation(scope);
    return (
      <>
        <TextField label="Outside" {...fieldErrorProps('Always wrong')} />
        <div ref={scope}>
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            {...fieldErrorProps(
              validation.errorFor(name ? undefined : 'Name is required'),
            )}
          />
        </div>
        <button onClick={() => (name ? undefined : validation.reveal())}>
          Submit
        </button>
        <button onClick={validation.reset}>Reset</button>
      </>
    );
  }

  it('focuses inside its scope, and goes quiet again on reset', async () => {
    render(<ScopedForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    // The field outside the scope is invalid too, and first in the document.
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(screen.getByText('Name is required')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).not.toHaveAttribute(
      'aria-invalid',
    );
  });
});

describe('focusFirstInvalidField', () => {
  it('skips what cannot take the focus and reports when nothing did', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-invalid><input disabled /></div>
      <div aria-hidden="true"><select aria-invalid="true"></select></div>
    `;
    document.body.appendChild(root);

    expect(focusFirstInvalidField(root)).toBe(false);

    root.insertAdjacentHTML(
      'beforeend',
      '<div data-invalid><span>label</span><input id="target" /></div>',
    );
    expect(focusFirstInvalidField(root)).toBe(true);
    expect(document.activeElement?.id).toBe('target');
    root.remove();
  });
});
