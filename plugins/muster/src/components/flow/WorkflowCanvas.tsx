import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Node,
  NodeMouseHandler,
  NodeTypes,
  Panel,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { makeStyles, Theme, Typography, useTheme } from '@material-ui/core';
import { StepNodeStatus, WorkflowNodeData } from '../../lib/workflowToGraph';
import { statusColor, STATUS_LABELS } from './statusColors';
import { WorkflowInputNode } from './WorkflowInputNode';
import { WorkflowStepNode } from './WorkflowStepNode';

const nodeTypes: NodeTypes = {
  workflowInput: WorkflowInputNode,
  workflowStep: WorkflowStepNode,
};

const LEGEND_STATUSES: StepNodeStatus[] = [
  'completed',
  'inprogress',
  'failed',
  'skipped',
  'pending',
];

const useStyles = makeStyles((theme: Theme) => ({
  canvas: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    borderRadius: theme.shape.borderRadius * 2,
    border: `1px solid ${theme.palette.divider}`,
    overflow: 'hidden',
    backgroundColor: theme.palette.background.default,
  },
  legend: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1, 1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
}));

export interface WorkflowCanvasProps {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  /** Show the status legend (when an execution overlay is applied). */
  showLegend?: boolean;
  onNodeClick?: NodeMouseHandler<Node<WorkflowNodeData>>;
}

export function WorkflowCanvas({
  nodes,
  edges,
  showLegend = false,
  onNodeClick,
}: WorkflowCanvasProps) {
  const classes = useStyles();
  const theme = useTheme();
  const colorMode = theme.palette.type === 'dark' ? 'dark' : 'light';

  const defaultEdgeOptions = useMemo(
    () => ({
      style: { stroke: theme.palette.divider, strokeWidth: 1.5 },
    }),
    [theme],
  );

  return (
    <div className={classes.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
        {showLegend && (
          <Panel position="bottom-right">
            <div className={classes.legend}>
              {LEGEND_STATUSES.map(status => (
                <div key={status} className={classes.legendRow}>
                  <span
                    className={classes.legendDot}
                    style={{ backgroundColor: statusColor(theme, status) }}
                  />
                  <Typography variant="caption">
                    {STATUS_LABELS[status]}
                  </Typography>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
