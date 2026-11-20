import { type ReactNode, useCallback, useId, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import {
  Alert,
  Cell,
  type ColumnConfig,
  Flex,
  Row,
  Switch,
  Table,
  Text,
} from '@backstage/ui';
import {
  ClusterRoleBinding,
  RoleBinding,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  EmptyStateCard,
  type FittingTier,
  SectionHeader,
  StackedRowList,
  useFittingColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { useCurrentCluster } from '../../clusters/ClusterDetailsPage/useCurrentCluster';
import {
  buildRbacSubjectRows,
  type RbacBindingInfo,
  type RbacSubjectRow,
} from '../../clusters/cluster-details/ClusterRBAC/utils';

const useStyles = makeStyles({
  // The subject: a button that shows its bindings under the row, its chevron
  // leading as the classic table's is.
  toggle: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: 'var(--bui-space-1)',
    border: 0,
    background: 'transparent',
    padding: 0,
    font: 'inherit',
    fontWeight: 500,
    textAlign: 'left',
    color: 'inherit',
    cursor: 'pointer',
    minWidth: 0,
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
      borderRadius: 2,
    },
    '& svg': {
      flex: 'none',
      fontSize: 20,
      color: 'var(--bui-fg-secondary)',
    },
  },
  // A service account's namespace, a group's prefix: names a person reads
  // whole, broken anywhere rather than cut.
  name: {
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  roles: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    minWidth: 0,
  },
  role: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
    maxWidth: '100%',
    boxSizing: 'border-box',
    paddingInline: 'var(--bui-space-2)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-full, 999px)',
    fontSize: 'var(--bui-font-size-2)',
    overflowWrap: 'anywhere',
  },
  bindings: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--bui-space-1)',
    overflowWrap: 'anywhere',
  },
  // Under the subject, as the classic table's detail panel indents it.
  detail: {
    paddingInlineStart: 'calc(20px + var(--bui-space-1))',
  },
  // The expanded row's cell: the row's tint, so it reads as the row's part.
  detailRow: {
    backgroundColor: 'var(--bui-bg-neutral-1)',
  },
});

/** One short unit on one line: a kind. */
const NO_WRAP = { whiteSpace: 'nowrap' } as const;

/**
 * Each column's least width, in px: its header and its usual content,
 * "ServiceAccount", two role chips, "Cluster-wide, org-fern". Subjects, roles
 * and scopes are free text, which wraps rather than being cut.
 */
const MIN_WIDTHS: Record<string, number> = {
  subject: 220,
  kind: 136,
  roles: 180,
  scope: 150,
};

/** Left out first, its value named under the subject. */
const DROP_FIRST = ['kind'] as const;

/** What the classic table shows for a subject: a service account with its namespace. */
function subjectName(row: RbacSubjectRow): string {
  return row.namespace ? `${row.namespace}/${row.name}` : row.name;
}

/** "RoleBinding X in namespace Y grants ClusterRole Z", as the classic tab has it. */
function BindingLine({ binding }: { binding: RbacBindingInfo }) {
  return (
    <li>
      <Text as="span" variant="body-medium">
        {binding.bindingKind} <b>{binding.bindingName}</b>
        {binding.namespace
          ? ` in namespace ${binding.namespace}`
          : ''} grants {binding.roleKind} <b>{binding.roleName}</b>
      </Text>
    </li>
  );
}

function Bindings({ row, id }: { row: RbacSubjectRow; id?: string }) {
  const classes = useStyles();
  return (
    <ul
      id={id}
      className={classes.bindings}
      aria-label={`Bindings of ${subjectName(row)}`}
    >
      {row.bindings.map(binding => (
        <BindingLine
          key={`${binding.bindingKind}/${binding.namespace ?? ''}/${binding.bindingName}`}
          binding={binding}
        />
      ))}
    </ul>
  );
}

function Roles({ row }: { row: RbacSubjectRow }) {
  const classes = useStyles();
  return (
    <ul className={classes.roles} aria-label={`Roles of ${subjectName(row)}`}>
      {row.roles.map(role => (
        <li key={role} className={classes.role}>
          {role}
        </li>
      ))}
    </ul>
  );
}

/** The subject's name, a button that shows or hides its bindings. */
function SubjectToggle({
  row,
  isExpanded,
  onToggle,
  controls,
  children,
}: {
  row: RbacSubjectRow;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  /** The id of the bindings it shows, while they are shown. */
  controls?: string;
  children?: ReactNode;
}) {
  const classes = useStyles();
  return (
    <button
      type="button"
      className={classes.toggle}
      aria-expanded={isExpanded}
      aria-controls={isExpanded ? controls : undefined}
      onClick={() => onToggle(row.id)}
    >
      {isExpanded ? (
        <ExpandMoreIcon aria-hidden />
      ) : (
        <ChevronRightIcon aria-hidden />
      )}
      <span className={classes.name}>{children ?? subjectName(row)}</span>
    </button>
  );
}

/** The id of a subject's bindings, shown under its row: by its place in the list. */
function bindingsId(prefix: string, index: number): string {
  return `${prefix}-bindings-${index}`;
}

/** The subject cell: the toggle, and while the Kind column is left out, the kind under it. */
function SubjectCell({
  row,
  isNarrow,
  isExpanded,
  onToggle,
  controls,
}: {
  row: RbacSubjectRow;
  isNarrow: boolean;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  controls: string;
}) {
  const classes = useStyles();
  return (
    <Cell>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <SubjectToggle
          row={row}
          isExpanded={isExpanded}
          onToggle={onToggle}
          controls={controls}
        />
        {isNarrow && (
          <Text
            as="span"
            variant="body-small"
            color="secondary"
            className={classes.detail}
          >
            {row.kind}
          </Text>
        )}
      </div>
    </Cell>
  );
}

/**
 * The subjects, one row each, as the classic RBAC tab's table: the subject,
 * its kind, its roles and where they apply; a subject's row opens to its
 * bindings. Narrower, the kind goes under the subject; narrower still, the
 * rows stack.
 */
function SubjectsTable({
  rows,
  isLoading,
  emptyState,
}: {
  rows: RbacSubjectRow[];
  isLoading: boolean;
  emptyState: ReactNode;
}) {
  const classes = useStyles();
  const prefix = useId().replace(/:/g, '');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Each subject's place in the list, for its bindings' DOM id.
  const indexOf = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
  const toggle = useCallback(
    (id: string) =>
      setExpanded(current => {
        const next = new Set(current);
        if (!next.delete(id)) {
          next.add(id);
        }
        return next;
      }),
    [],
  );

  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<RbacSubjectRow>[] => {
      const isNarrow = tier !== 'full';
      return [
        {
          id: 'subject',
          label: 'Subject',
          isRowHeader: true,
          defaultWidth: '1.6fr',
          cell: row => (
            <SubjectCell
              row={row}
              isNarrow={isNarrow}
              isExpanded={expanded.has(row.id)}
              onToggle={toggle}
              controls={bindingsId(prefix, indexOf.get(row.id) ?? 0)}
            />
          ),
        },
        {
          id: 'kind',
          label: 'Kind',
          defaultWidth: '0.8fr',
          cell: row => (
            <Cell>
              <Text variant="body-medium" style={NO_WRAP}>
                {row.kind}
              </Text>
            </Cell>
          ),
        },
        {
          id: 'roles',
          label: 'Roles',
          defaultWidth: '1.4fr',
          cell: row => (
            <Cell>
              <Roles row={row} />
            </Cell>
          ),
        },
        {
          id: 'scope',
          label: 'Access scope',
          defaultWidth: '1.2fr',
          cell: row => (
            <Cell>
              <Text variant="body-medium" style={{ overflowWrap: 'anywhere' }}>
                {row.scopeText}
              </Text>
            </Cell>
          ),
        },
      ];
    },
    [expanded, toggle, prefix, indexOf],
  );

  const fit = useFittingColumns(columnsFor, {
    minWidths: MIN_WIDTHS,
    dropFirst: DROP_FIRST,
  });
  const visibleColumns = useMemo(
    () => fit.columns.filter(column => !column.isHidden),
    [fit.columns],
  );

  if (fit.isCompact && !isLoading) {
    return (
      <div ref={fit.ref}>
        <StackedRowList
          aria-label="Subjects"
          emptyState={emptyState}
          rows={rows.map((row, index) => {
            const isExpanded = expanded.has(row.id);
            const id = bindingsId(prefix, index);
            return {
              id: row.id,
              title: (
                <SubjectToggle
                  row={row}
                  isExpanded={isExpanded}
                  onToggle={toggle}
                  controls={id}
                />
              ),
              facts: [row.kind, row.scopeText],
              details: (
                <Flex direction="column" gap="2">
                  <Roles row={row} />
                  {isExpanded && <Bindings row={row} id={id} />}
                </Flex>
              ),
            };
          })}
        />
      </div>
    );
  }

  return (
    <div ref={fit.ref}>
      <Table<RbacSubjectRow>
        columnConfig={fit.columns}
        data={isLoading ? undefined : rows}
        isPending={isLoading}
        pagination={{ type: 'none' }}
        emptyState={emptyState}
        rowConfig={({ item: row }) => (
          <>
            <Row id={row.id} columns={visibleColumns}>
              {column => column.cell(row)}
            </Row>
            {expanded.has(row.id) && (
              <Row
                id={`${row.id}#bindings`}
                columns={[{ id: 'bindings' }]}
                className={classes.detailRow}
              >
                {() => (
                  <Cell colSpan={visibleColumns.length}>
                    <div className={classes.detail}>
                      <Bindings
                        row={row}
                        id={bindingsId(prefix, indexOf.get(row.id) ?? 0)}
                      />
                    </div>
                  </Cell>
                )}
              </Row>
            )}
          </>
        )}
      />
    </div>
  );
}

/** A failed read of `useResources`, as one sentence. */
type ReadErrors = ReturnType<typeof useResources>['errors'];

function messagesOf(errors: ReadErrors): string[] {
  return errors.map(info =>
    info.type === 'incompatibility'
      ? `${info.cluster} serves an API version the portal cannot read.`
      : info.error.message,
  );
}

/**
 * The RBAC tab of a Platform cluster page, for a management cluster: who can
 * do what in it, as the classic cluster page's RBAC tab has it. Every user,
 * group and service account a RoleBinding or ClusterRoleBinding grants a
 * role, with its roles and where they apply; a row opens to the bindings.
 * System subjects are hidden until the person shows them.
 */
export function PlatformClusterRBAC() {
  const { installationName } = useCurrentCluster();
  const [showSystem, setShowSystem] = useState(false);
  const headingId = useId();

  const roleBindings = useResources(installationName, RoleBinding);
  const clusterRoleBindings = useResources(
    installationName,
    ClusterRoleBinding,
  );
  const isLoading = roleBindings.isLoading || clusterRoleBindings.isLoading;
  const errors = useMemo(
    () => messagesOf([...roleBindings.errors, ...clusterRoleBindings.errors]),
    [roleBindings.errors, clusterRoleBindings.errors],
  );

  const rows = useMemo(
    () =>
      buildRbacSubjectRows(
        roleBindings.resources,
        clusterRoleBindings.resources,
      ),
    [roleBindings.resources, clusterRoleBindings.resources],
  );
  const systemCount = useMemo(
    () => rows.filter(row => row.isSystem).length,
    [rows],
  );
  const visibleRows = useMemo(
    () => (showSystem ? rows : rows.filter(row => !row.isSystem)),
    [rows, showSystem],
  );

  const readFailed = errors.length > 0;
  const errorDescription = `${[...new Set(errors)].join(' ')} Reading role bindings requires cluster-wide read access.`;

  if (!isLoading && rows.length === 0) {
    return readFailed ? (
      <Alert
        role="alert"
        status="danger"
        icon
        title={`Could not read the role bindings of ${installationName}`}
        description={errorDescription}
      />
    ) : (
      <EmptyStateCard
        title="No RBAC bindings to show"
        description="Either none exist, or your account is not allowed to list them on this cluster."
      />
    );
  }

  return (
    <Flex direction="column" gap="4">
      {readFailed && (
        <Alert
          status="warning"
          icon
          title="Some role bindings could not be read"
          description={errorDescription}
        />
      )}
      <Text as="p" variant="body-medium">
        Who can do what in this cluster: every user, group and service account
        granted access through a RoleBinding or ClusterRoleBinding, with the
        roles it holds and where they apply. Expand a row to see the individual
        bindings.
      </Text>
      <section aria-labelledby={headingId}>
        <Flex direction="column" gap="3">
          <Flex
            align="center"
            justify="between"
            gap="3"
            style={{ flexWrap: 'wrap' }}
          >
            <SectionHeader
              as="h2"
              variant="title-x-small"
              id={headingId}
              title={
                isLoading
                  ? 'Access grants'
                  : `Access grants (${visibleRows.length} ${visibleRows.length === 1 ? 'subject' : 'subjects'})`
              }
              compact
            />
            <Switch
              label={
                isLoading
                  ? 'Show system subjects'
                  : `Show system subjects (${systemCount})`
              }
              isSelected={showSystem}
              onChange={setShowSystem}
              isDisabled={isLoading}
            />
          </Flex>
          <SubjectsTable
            rows={visibleRows}
            isLoading={isLoading}
            emptyState={
              <Text variant="body-medium" color="secondary">
                Only system subjects have bindings here. Show system subjects to
                see them.
              </Text>
            }
          />
        </Flex>
      </section>
    </Flex>
  );
}
