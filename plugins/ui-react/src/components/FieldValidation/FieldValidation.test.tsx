import { useMemo, useRef, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

function nameProblem(name: string): string | undefined {
  if (!name.trim()) {
    return 'Name is required';
  }
  return /^[a-z]/.test(name)
    ? undefined
    : 'Start the name with a lowercase letter';
}

function Form({ onContinue }: { onContinue: () => void }) {
  const [region, setRegion] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const validation = useFieldValidation();
  const errors = {
    region: region ? undefined : 'Select a region',
    name: nameProblem(name),
    notes: notes.trim() ? undefined : 'Notes are required',
  };
  const isValid = !errors.region && !errors.name && !errors.notes;
  const regionError = useSelectFieldError(
    validation.errorFor('region', errors.region),
  );
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
        {...validation.textFieldProps('name', errors.name)}
      />
      <TextAreaField
        label="Notes"
        value={notes}
        onChange={setNotes}
        {...validation.fieldProps('notes', errors.notes)}
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

  it('says nothing about a required field that was only tabbed through', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('textbox', { name: /Name/ }));
    await userEvent.tab();

    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });

  it('checks a field once the person leaves it, not while they type', async () => {
    renderForm();
    const name = screen.getByRole('textbox', { name: /Name/ });

    await userEvent.type(name, '1');
    expect(
      screen.queryByText('Start the name with a lowercase letter'),
    ).not.toBeInTheDocument();

    await userEvent.tab();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(describedText(name)).toContain(
      'Start the name with a lowercase letter',
    );
    // Said aloud too: the focus, and the screen reader, are on the next field.
    await waitFor(() =>
      expect(
        document.querySelector('[data-field-validation-announcer]'),
      ).toHaveTextContent('Start the name with a lowercase letter'),
    );
  });

  it('flags a field the person emptied on leaving it', async () => {
    renderForm();
    const name = screen.getByRole('textbox', { name: /Name/ });

    await userEvent.type(name, 'a');
    await userEvent.clear(name);
    await userEvent.tab();

    expect(describedText(name)).toContain('Name is required');
  });

  it('keeps a shown error in step with each change, so it clears the moment it is fixed', async () => {
    renderForm();
    const name = screen.getByRole('textbox', { name: /Name/ });
    await userEvent.type(name, '1');
    await userEvent.tab();

    // Edited straight from one problem into another, then into a valid value.
    await userEvent.type(name, '{Home}A');
    expect(describedText(name)).toContain(
      'Start the name with a lowercase letter',
    );
    await userEvent.clear(name);
    expect(describedText(name)).toContain('Name is required');
    await userEvent.type(name, 's');
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  it('keeps a new problem quiet while the person types into a field that was fine on entry', async () => {
    renderForm();
    const name = screen.getByRole('textbox', { name: /Name/ });
    await userEvent.type(name, 'support');
    await userEvent.tab();

    await userEvent.click(name);
    await userEvent.type(name, '{Home}9');
    expect(name).not.toHaveAttribute('aria-invalid');
    await userEvent.tab();
    expect(describedText(name)).toContain(
      'Start the name with a lowercase letter',
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
      'support',
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

describe('useFieldValidation around other fields and presses', () => {
  /** A required A, a B that must come with A, and an Extra that can be opened. */
  function PairForm({ onToggle }: { onToggle?: () => void }) {
    const [a, setA] = useState('');
    const [b, setB] = useState('');
    const [extra, setExtra] = useState('');
    const [more, setMore] = useState(false);
    const validation = useFieldValidation();
    const errors = {
      a: a ? undefined : 'Enter A',
      b: a && !b ? 'Set B together with A' : undefined,
      extra: extra ? undefined : 'Enter the extra value',
    };
    return (
      <>
        <TextField
          label="A"
          value={a}
          onChange={setA}
          {...validation.textFieldProps('a', errors.a)}
        />
        <TextField
          label="B"
          value={b}
          onChange={setB}
          {...validation.textFieldProps('b', errors.b)}
        />
        {more && (
          <TextField
            label="Extra"
            value={extra}
            onChange={setExtra}
            {...validation.textFieldProps('extra', errors.extra)}
          />
        )}
        <button
          onClick={() => {
            setMore(previous => !previous);
            onToggle?.();
          }}
        >
          Toggle extra
        </button>
        <button onClick={validation.reveal}>Save</button>
        <button onClick={validation.reset}>Reset</button>
      </>
    );
  }

  const field = (name: string) =>
    screen.getByRole('textbox', { name: new RegExp(`^${name}`) });

  it('after a submit, shows a problem a field gains from another field as it arises', async () => {
    render(<PairForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(describedText(field('A'))).toContain('Enter A');

    // B is never focused; its problem comes from A.
    await userEvent.type(field('A'), 'x');
    expect(field('A')).not.toHaveAttribute('aria-invalid');
    expect(describedText(field('B'))).toContain('Set B together with A');
  });

  it('keeps a field that appears after a submit quiet until it is left or submitted', async () => {
    render(<PairForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await userEvent.click(screen.getByRole('button', { name: 'Toggle extra' }));
    expect(field('Extra')).not.toHaveAttribute('aria-invalid');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(describedText(field('Extra'))).toContain('Enter the extra value');
  });

  it('holds back a check caused by pressing a button until the press is over, so the press lands', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    render(<PairForm onToggle={onToggle} />);
    await user.type(field('A'), 'x');
    await user.clear(field('A'));
    const toggle = screen.getByRole('button', { name: 'Toggle extra' });

    await user.pointer({ keys: '[MouseLeft>]', target: toggle });
    // The pointer is down and the field has lost the focus: no error line yet
    // to push the button from under the pointer.
    expect(field('A')).not.toHaveAttribute('aria-invalid');

    await user.pointer({ keys: '[/MouseLeft]', target: toggle });
    expect(onToggle).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(field('A')).toHaveAttribute('aria-invalid', 'true'),
    );
  });

  it('forgets the visit of a field that unmounted while it had the focus', async () => {
    render(<PairForm />);
    const toggle = screen.getByRole('button', { name: 'Toggle extra' });
    fireEvent.click(toggle);
    await userEvent.type(field('Extra'), 'q');
    // Closed while Extra has the focus: React calls no onBlur.
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    await userEvent.click(field('Extra'));
    await userEvent.tab();
    expect(field('Extra')).not.toHaveAttribute('aria-invalid');
  });

  it('drops a pending announcement when the form is reset', async () => {
    render(<PairForm />);
    await userEvent.type(field('A'), 'x');
    await userEvent.clear(field('A'));
    await userEvent.tab();
    // Reset before the announcement goes out (a dialog closed with Cancel).
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    await new Promise(resolve => setTimeout(resolve, 100));
    expect(
      document.querySelector('[data-field-validation-announcer]'),
    ).toBeEmptyDOMElement();
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
              validation.errorFor(
                'name',
                name ? undefined : 'Name is required',
              ),
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
