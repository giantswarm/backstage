import { ReactNode, useCallback, useState } from 'react';
import classNames from 'classnames';
import {
  Box,
  Button,
  Collapse,
  makeStyles,
  Paper,
  Typography,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';

const useStyles = makeStyles(theme => {
  const bodyBackgroundColor =
    theme.palette.type === 'light' ? '#f8f8f8' : '#333';

  return {
    root: {
      display: 'flex',
      flexDirection: 'column',
      marginTop: -theme.spacing(1),
    },
    node: {
      position: 'relative',
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(1),
      paddingRight: theme.spacing(1),
    },
    nodeSticky: {
      position: 'sticky',
      top: 0,
      backgroundColor: bodyBackgroundColor,

      '&::after': {
        content: '\"\"',
        position: 'absolute',
        left: 0,
        bottom: -theme.spacing(1),
        width: '100%',
        height: theme.spacing(1),
        background: `linear-gradient(to bottom, ${bodyBackgroundColor}, transparent)`,
      },
    },
    nodeLabel: {
      margin: 0,
    },
    expandButton: {
      '& svg': {
        transition: theme.transitions.create('transform'),
      },
    },
    expandButtonExpanded: {
      '& svg': {
        transform: 'rotate(90deg)',
      },
    },
  };
});

type NodeData = {
  label: string;
};

type Node<T extends NodeData> = {
  id: string;
  nodeData: T;
  level: number;
  children: Node<T>[];
  displayInCompactView?: boolean;
};

type RenderNodeFn<T extends NodeData> = (
  nodeData: T,
  options: {
    expandable: boolean;
    expanded: boolean;
    onExpand: () => void;
  },
) => ReactNode;

type TreeNodeProps<T extends NodeData> = {
  node: Node<T>;
  compactView: boolean;
  sticky: boolean;
  stickyItemHeight: number;
  renderNode?: RenderNodeFn<T>;
};

function TreeNode<T extends NodeData>({
  node,
  compactView,
  sticky,
  stickyItemHeight,
  renderNode,
}: TreeNodeProps<T>) {
  const classes = useStyles();
  const [expanded, setExpanded] = useState(false);

  const handleExpand = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  const children = node.children.filter(
    child => !compactView || child.displayInCompactView,
  );

  const expandable = Boolean(children.length);

  return (
    <Box display="flex" flexDirection="column">
      <Box
        className={classNames(classes.node, {
          [classes.nodeSticky]: sticky && expanded,
        })}
        style={
          sticky && expanded
            ? { top: node.level * stickyItemHeight, zIndex: 100 - node.level }
            : undefined
        }
      >
        {renderNode ? (
          renderNode(node.nodeData, {
            expandable,
            expanded,
            onExpand: handleExpand,
          })
        ) : (
          <Paper>
            <Box display="flex">
              {expandable ? (
                <Button
                  className={classNames(classes.expandButton, {
                    [classes.expandButtonExpanded]: expanded,
                  })}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleExpand();
                  }}
                >
                  <PlayArrowIcon />
                </Button>
              ) : null}
              <Box py={2} px={2}>
                <Typography variant="h6" className={classes.nodeLabel}>
                  {node.nodeData.label}
                </Typography>
              </Box>
            </Box>
          </Paper>
        )}
      </Box>
      {children.length ? (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box pl={4} pt={1}>
            <Tree<T>
              nodes={children}
              compactView={compactView}
              sticky={sticky}
              stickyItemHeight={stickyItemHeight}
              renderNode={renderNode}
            />
          </Box>
        </Collapse>
      ) : null}
    </Box>
  );
}

type TreeProps<T extends NodeData> = {
  nodes: Node<T>[];
  compactView: boolean;
  sticky?: boolean;
  stickyItemHeight?: number;
  renderNode?: RenderNodeFn<T>;
};

export function Tree<T extends NodeData>({
  nodes,
  compactView,
  sticky = false,
  stickyItemHeight = 80,
  renderNode,
}: TreeProps<T>) {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      {nodes.map(treeNode =>
        compactView && !treeNode.displayInCompactView ? null : (
          <TreeNode
            key={treeNode.id}
            node={treeNode}
            compactView={compactView}
            sticky={sticky}
            stickyItemHeight={stickyItemHeight}
            renderNode={renderNode}
          />
        ),
      )}
    </Box>
  );
}
