import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { FieldErrorText } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../../apis';
import { MusterInstanceContext } from '../../MusterInstanceProvider';
import { makeTestMusterInstance } from '../../MusterInstanceProvider/testInstance';
import {
  DefinitionEditorDialog,
  DefinitionEditorDialogProps,
} from './DefinitionEditorDialog';

function parseJson(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('Invalid JSON:\nline two');
  }
}

/** An open button and the dialog; `seed` reads a value the test can change. */
function Harness({
  onClose,
  seedRef,
  parse = parseJson,
}: {
  onClose: jest.Mock;
  seedRef: { current: string };
  parse?: DefinitionEditorDialogProps['parse'];
}) {
  const [open, setOpen] = useState(false);
  const props: DefinitionEditorDialogProps = {
    open,
    onClose: () => {
      onClose();
      setOpen(false);
    },
    installation: 'gazelle',
    title: 'Edit thing',
    description: 'Edit the thing.',
    seed: () => seedRef.current,
    parse,
    renderEditor: ({ value, onChange, error, blurProps }) => (
      <>
        <textarea
          aria-label="Definition"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'definition-error' : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          {...blurProps}
        />
        {error && (
          <FieldErrorText id="definition-error">{error}</FieldErrorText>
        )}
      </>
    ),
    validateTool: 'core_thing_validate',
    saveTool: 'core_thing_update',
    saveUntrackedReason: 'A test.',
    savedMessage: 'Saved the thing.',
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <DefinitionEditorDialog {...props} />
    </>
  );
}

async function renderDialog(
  callTool: jest.Mock = jest.fn(async () => ({})),
  parse?: DefinitionEditorDialogProps['parse'],
) {
  const retry = jest.fn();
  const onClose = jest.fn();
  const seedRef = { current: '{"name":"a"}' };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, { callTool }]]}>
      <QueryClientProvider client={queryClient}>
        <MusterInstanceContext.Provider
          value={makeTestMusterInstance({ retry })}
        >
          <Harness onClose={onClose} seedRef={seedRef} parse={parse} />
        </MusterInstanceContext.Provider>
      </QueryClientProvider>
    </TestApiProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'open' }));
  return { retry, onClose, callTool, seedRef };
}

const editor = () => screen.getByRole('textbox', { name: 'Definition' });

describe('DefinitionEditorDialog', () => {
  it('validates with the validate tool and writes nothing', async () => {
    const { callTool, retry } = await renderDialog();

    expect(editor()).toHaveValue('{"name":"a"}');
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(await screen.findByText('Definition is valid.')).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'core_thing_validate',
      { name: 'a' },
      'gazelle',
    );
    expect(retry).not.toHaveBeenCalled();
  });

  it('saves with the save tool and refetches the reads', async () => {
    const { callTool, retry } = await renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved the thing.')).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'core_thing_update',
      { name: 'a' },
      'gazelle',
    );
    expect(retry).toHaveBeenCalled();
  });

  it('shows a parse error on the editor, focuses it and calls no tool', async () => {
    const { callTool } = await renderDialog();

    await userEvent.clear(editor());
    await userEvent.type(editor(), 'not json');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(editor()).toHaveAttribute('aria-invalid', 'true');
    expect(editor()).toHaveAccessibleDescription(
      expect.stringContaining('Invalid JSON:'),
    );
    expect(editor()).toHaveFocus();
    expect(callTool).not.toHaveBeenCalled();

    // Fixed, the error goes at once — no second Validate needed.
    await userEvent.clear(editor());
    await userEvent.type(editor(), '{{"name":"b"}');
    expect(editor()).toHaveAttribute('aria-invalid', 'false');
  });

  it('checks the text when the person leaves the editor', async () => {
    await renderDialog();

    await userEvent.type(editor(), ' broken');
    expect(editor()).toHaveAttribute('aria-invalid', 'false');

    await userEvent.tab();
    expect(editor()).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the tool error and no success message', async () => {
    await renderDialog(jest.fn(async () => Promise.reject(new Error('boom'))));

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByText('Saved the thing.')).not.toBeInTheDocument();
    // A failed call says nothing about the definition.
    expect(editor()).toHaveAttribute('aria-invalid', 'false');
  });

  it("drops the last call's success when the text no longer parses", async () => {
    await renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Definition is valid.')).toBeInTheDocument();
    await userEvent.type(editor(), ' broken');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(screen.queryByText('Definition is valid.')).not.toBeInTheDocument();
  });

  it('cannot be dismissed while a call is in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    const { onClose } = await renderDialog(
      jest.fn(() => new Promise(resolve => (finish = resolve))),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    // The footer's Close is disabled, the header's routes through onOpenChange.
    for (const close of screen.getAllByRole('button', { name: 'Close' })) {
      await userEvent.click(close);
    }
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    finish({});
    expect(await screen.findByText('Saved the thing.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reseeds on open only, not while open', async () => {
    const { seedRef } = await renderDialog();

    await userEvent.type(editor(), ' typed');
    seedRef.current = '{"name":"b"}';
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(editor()).toHaveValue('{"name":"a"} typed');

    // Unsaved edits: Escape asks before they go.
    await userEvent.keyboard('{Escape}');
    expect(
      await screen.findByText('Discard your changes?'),
    ).toBeInTheDocument();
    // The editor dialog behind is hidden from the accessibility tree, so the
    // one "Discard changes" left is the confirm's.
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard changes' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(editor()).toHaveValue('{"name":"b"}');
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
  });

  it('says "Discard changes" rather than "Close" while edits are unsaved', async () => {
    const { onClose } = await renderDialog();

    expect(
      screen.getAllByRole('button', { name: 'Close' }).length,
    ).toBeGreaterThan(0);
    await userEvent.type(editor(), ' typed');
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard changes' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says the definition could not be parsed when parse throws no message', async () => {
    const callTool = jest.fn();
    await renderDialog(callTool, () => {
      throw new Error('');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Validate' }));

    expect(
      await screen.findByText('The definition could not be parsed.'),
    ).toBeInTheDocument();
    expect(callTool).not.toHaveBeenCalled();
  });
});
