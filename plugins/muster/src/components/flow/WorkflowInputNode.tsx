import { memo } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { Chip, makeStyles, Theme, Typography } from '@material-ui/core';
import InputIcon from '@material-ui/icons/Input';
import { InputNodeData } from '../../lib/workflowToGraph';

const useStyles = makeStyles((theme: Theme) => ({
  node: {
    width: 320,
    borderRadius: theme.shape.borderRadius * 2,
    border: `1px dashed ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    fontFamily: theme.typography.fontFamily,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 1.5),
  },
  title: {
    fontWeight: 600,
    flex: 1,
  },
  args: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0, 1.5, 1, 1.5),
  },
  chip: {
    height: 20,
    fontSize: '0.65rem',
  },
}));

type Props = NodeProps & { data: InputNodeData };

export const WorkflowInputNode = memo(({ data }: Props) => {
  const classes = useStyles();
  const argNames = Object.keys(data.args);

  return (
    <div className={classes.node} data-testid="workflow-input-node">
      <div className={classes.header}>
        <InputIcon fontSize="small" color="action" />
        <Typography variant="body2" className={classes.title}>
          Input
        </Typography>
      </div>
      {argNames.length > 0 && (
        <div className={classes.args}>
          {argNames.map(name => {
            const definition = data.args[name];
            const value = data.input?.[name];
            const label =
              value !== undefined
                ? `${name}: ${formatValue(value)}`
                : `${name}${definition.required ? '*' : ''}`;
            return (
              <Chip
                key={name}
                className={classes.chip}
                size="small"
                variant="outlined"
                label={label}
              />
            );
          })}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
});

function formatValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 24 ? `${text.slice(0, 24)}…` : text;
}
