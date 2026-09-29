import { CSSProperties } from 'react';
import { Text } from '@backstage/ui';
import { SimpleAccordion } from '@giantswarm/backstage-plugin-ui-react';
import {
  countsOfDifferences,
  FileGroup as Group,
  foundWords,
  MarkedDifference,
  wordsOf,
} from '../lib/comparison';
import {
  alignIndentation,
  DiffLine,
  diffLines,
  DiffRun,
  foldContext,
  foldLabel,
} from '../lib/diff';
import { DifferenceLine, LIST_STYLE } from './DimensionItem';
import { MarkTag } from './StateTag';

const DIFF_STYLE: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre',
  overflowX: 'auto',
  margin: '4px 0',
};

const GUTTER_STYLE: CSSProperties = {
  display: 'inline-block',
  width: '4ch',
  marginRight: '1ch',
  textAlign: 'right',
  opacity: 0.55,
  userSelect: 'none',
};

const ANNOTATION_STYLE: CSSProperties = {
  paddingLeft: '12ch',
  whiteSpace: 'normal',
};

const NOTE_STYLE: CSSProperties = {
  cursor: 'pointer',
  opacity: 0.7,
};

/** The tint of a changed line: bui's danger and success surfaces, so the diff themes with the app. */
const ROW_BACKGROUND: Record<DiffLine['kind'], string | undefined> = {
  context: undefined,
  removed: 'var(--bui-bg-danger)',
  added: 'var(--bui-bg-success)',
};

const SIGN: Record<DiffLine['kind'], string> = {
  context: ' ',
  removed: '-',
  added: '+',
};

/** Whether a difference sits on a line of the diff: by `line` on the rendered side, else by `currentLine` on the record's. */
export function placed({ difference }: MarkedDifference): boolean {
  return Boolean(difference.line || difference.currentLine);
}

/** The differences on this line of the diff. */
function annotationsOn(
  line: DiffLine,
  differences: MarkedDifference[],
): MarkedDifference[] {
  return differences.filter(({ difference: d }) =>
    d.line ? line.line === d.line : line.currentLine === d.currentLine,
  );
}

function Row({
  line,
  differences,
}: {
  line: DiffLine;
  differences: MarkedDifference[];
}) {
  return (
    <div
      data-testid="diff-line"
      data-kind={line.kind}
      data-line={line.line}
      data-current-line={line.currentLine}
      style={{ background: ROW_BACKGROUND[line.kind] }}
    >
      <span style={GUTTER_STYLE}>{line.currentLine ?? ''}</span>
      <span style={GUTTER_STYLE}>{line.line ?? ''}</span>
      {SIGN[line.kind]} {line.text}
      {annotationsOn(line, differences).map((annotation, i) => (
        <div key={i} style={ANNOTATION_STYLE} data-testid="annotation">
          {annotation.difference.path ? (
            <code>{annotation.difference.path} </code>
          ) : null}
          <MarkTag mark={annotation.mark} words={wordsOf(annotation)} />
        </div>
      ))}
    </div>
  );
}

/**
 * A run folded behind its expander: an unchanged stretch, or the comment
 * and blank lines a change consists of, tinted as removed or added so the
 * reader knows which side they leave or join.
 */
function Fold({
  run,
  differences,
}: {
  run: DiffRun;
  differences: MarkedDifference[];
}) {
  const tint =
    run.fold === 'comments' ? ROW_BACKGROUND[run.lines[0].kind] : undefined;
  return (
    <details data-testid={`fold-${run.fold}`}>
      <summary style={{ ...NOTE_STYLE, background: tint }}>
        {foldLabel(run)}
      </summary>
      {run.lines.map(line => (
        <Row
          key={`${line.currentLine}-${line.line}`}
          line={line}
          differences={differences}
        />
      ))}
    </details>
  );
}

/**
 * The unified diff of the file on record against the file as rendered, the
 * record's and the render's line numbers in the gutters, each difference
 * annotated on its line with its reason in its mark's colour, the
 * unchanged stretches and the comment-only changes folded behind an
 * expander. Where one side indents deeper (a file SOPS wrote), its
 * indentation is shown at the other's, and one line says so.
 */
export function Diff({
  current,
  content,
  differences,
}: {
  current: string;
  content: string;
  differences: MarkedDifference[];
}) {
  const aligned = alignIndentation(current, content);
  const runs = foldContext(diffLines(aligned.current, aligned.content));
  const { reindented } = aligned;
  return (
    <div style={DIFF_STYLE} data-testid="diff">
      {reindented && (
        <div style={NOTE_STYLE} data-testid="reindented">
          {`… the ${reindented.side}'s ${reindented.from}-space indentation shown as ${reindented.to} spaces`}
        </div>
      )}
      {runs.map((run, i) =>
        run.fold ? (
          <Fold key={i} run={run} differences={differences} />
        ) : (
          run.lines.map(line => (
            <Row
              key={`${line.currentLine}-${line.line}`}
              line={line}
              differences={differences}
            />
          ))
        ),
      )}
    </div>
  );
}

/**
 * One file of the comparison, collapsed to its summary line: its path, once,
 * with the hub it is on where that is not the installation compared, and
 * the values that differ in it; opened on request to the diff of the record
 * against the render with the differences on their lines, where the answer
 * carries the file's content, and the differences the diff cannot place as
 * one line each. Closed until opened whatever it holds: a diff runs to
 * thousands of lines, and the summary line says what is in it.
 */
export function FileGroup({ group }: { group: Group }) {
  const { plan, differences } = group;
  const counts = countsOfDifferences(differences);
  const content = plan?.content;
  const onLines = content === undefined ? [] : differences.filter(placed);
  const listed = differences.filter(d => !onLines.includes(d));
  return (
    <div data-testid={`file-${group.file}`}>
      <SimpleAccordion
        title={
          <Text as="span" variant="body-medium">
            <code>{group.file}</code>
            {group.hub ? ` on the hub ${group.hub}` : ''} —{' '}
            {foundWords(counts, 'value').join(' · ')}
          </Text>
        }
      >
        {content !== undefined && (
          <Diff
            current={plan?.current ?? ''}
            content={content}
            differences={onLines}
          />
        )}
        {listed.length > 0 && (
          <ul style={LIST_STYLE}>
            {listed.map((difference, i) => (
              <DifferenceLine key={i} difference={difference} />
            ))}
          </ul>
        )}
      </SimpleAccordion>
    </div>
  );
}
