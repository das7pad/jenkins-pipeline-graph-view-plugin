import { LocalizedMessageKey, Messages } from "../../../common/i18n/index.ts";
import {
  CompositeConnection,
  LayoutInfo,
  NodeColumn,
  NodeInfo,
  NodeLabelInfo,
  PlaceholderNodeInfo,
  PositionedGraph,
  Result,
  StageInfo,
  StageNodeInfo,
  StageType,
} from "./PipelineGraphModel.tsx";

export const sequentialStagesLabelOffset = 80;

const maxColumnsWhenCollapsed = 13;

export function layoutGraph2(
  newStages: Array<StageInfo>,
  layout: LayoutInfo,
  collapsed: boolean,
  messages: Messages,
  showNames: boolean,
  showDurations: boolean,
) {
  console.log(JSON.stringify(newStages));
  const graph: Graph = {
    limit: collapsed ? maxColumnsWhenCollapsed : -1,
    root: {
      x: layout.nodeSpacingH / 2,
      y: layout.ypStart,
      maxWidth: layout.nodeSpacingH,
      maxDepth: layout.nodeSpacingV,
      name: "Root",
      id: -42,
      key: "root",
      isPlaceholder: true,
      type: "root",
      children: [
        {
          x: 0,
          y: 0,
          maxWidth: layout.nodeSpacingH,
          maxDepth: layout.nodeSpacingV,
          name: messages.format(LocalizedMessageKey.start),
          id: -1,
          isPlaceholder: true,
          key: "start-node",
          type: "start",
          children: [],
        },
      ],
    },
    counterNode: {
      x: 0,
      y: 0,
      maxWidth: layout.nodeSpacingH,
      maxDepth: layout.nodeSpacingV,
      name: "Counter",
      id: -2,
      isPlaceholder: true,
      key: "counter-node",
      type: "counter",
      stages: [],
      children: [],
    },
  };
  if (collapsed) {
    collectCollapsed(newStages, graph);
    if (graph.counterNode.stages.length > 0) {
      graph.root.maxWidth += layout.nodeSpacingH;
      graph.root.children.push(graph.counterNode);
    }
  } else {
    collectNested(graph.root, newStages, layout);
  }
  graph.root.maxWidth += layout.nodeSpacingH;
  graph.root.children.push({
    x: 0,
    y: 0,
    maxWidth: 1,
    maxDepth: 1,
    name: messages.format(LocalizedMessageKey.end),
    id: -3,
    isPlaceholder: true,
    key: "end-node",
    type: "end",
    children: [],
  });

  const computePositions = (node: GraphNode) => {
    let xP = node.x;
    let yP = node.y;
    for (const [i, child] of node.children.entries()) {
      if (
        child.hasParallel &&
        resolveDestination(child).some((c) => c.children.length > 0)
      ) {
        xP += sequentialStagesLabelOffset;
      }
      if (i === 0 && node.type === "parallel" && child.isSkipped) {
        xP += layout.nodeSpacingH;
      }
      child.x = xP;
      child.y = yP;
      if (child.type === "end") {
        child.x -= layout.nodeSpacingH / 2;
      }
      if (child.type === "parallel") {
        yP += child.maxDepth;
      } else {
        xP += child.maxWidth;
      }
      computePositions(child);
    }
  };
  computePositions(graph.root);

  const connections: CompositeConnection[] = [];
  const computeConnections = (node: GraphNode): GraphNode[] => {
    if (node.children.length === 0) {
      return [node];
    }
    if (node.hasParallel) {
      return (
        node.children
          .flatMap((child) => computeConnections(child))
          // Honor skipped state per layer, but not across layers. TODO: still needed?
          .map((node) => ({ ...node, isSkipped: false }))
      );
    }
    const skipped: Set<GraphNode> = new Set();
    if (node.type !== "root") {
      const destinationNodes = resolveDestination(node.children[0]);
      if (destinationNodes.length === 1 && destinationNodes[0].isSkipped) {
        skipped.add(node);
        skipped.add(destinationNodes[0]);
      } else {
        connections.push({
          sourceNodes: [node],
          destinationNodes,
          skippedNodes: [],
          hasBranchLabels: destinationNodes.some(
            (n) => n.type === "parallel" && n.children.length > 0,
          ),
        });
      }
    }
    for (let i = 0; i < node.children.length - 1; i++) {
      const childA = node.children[i];
      const childB = node.children[i + 1];
      const destinationNodes = resolveDestination(childB);
      if (!destinationNodes.some((n) => !n.isSkipped)) {
        // TODO: test parallel with all skipped inside
        for (const node of computeConnections(childA)) {
          skipped.add(node);
        }
        for (const node of destinationNodes) {
          skipped.add(node);
        }
        continue;
      }
      const nodes = Array.from(skipped).concat(computeConnections(childA));
      connections.push({
        sourceNodes: nodes.filter((n) => !n.isSkipped),
        destinationNodes,
        skippedNodes: nodes.filter((n) => n.isSkipped),
        hasBranchLabels: destinationNodes.some(
          (n) => n.type === "parallel" && n.children.length > 0,
        ),
      });
      skipped.clear();
    }
    const last = node.children[node.children.length - 1];
    if (last.isSkipped) {
      if (node.children.length > 1) {
        skipped.add(node.children[node.children.length - 2]);
      }
      skipped.add(last);
    }
    if (skipped.size > 0) {
      let destinationNodes: GraphNode[] = resolveDestination(last);
      if (last.isSkipped) {
        destinationNodes = [
          {
            isPlaceholder: true,
            type: "stage-end",
            key: `pe_${node.key}`,
            x: last.x + layout.nodeSpacingH,
            y: last.y,
            name: "",
            id: 1_000_000 + node.id,
            maxDepth: 1,
            maxWidth: 1,
            children: [],
          },
        ];
      }
      connections.push({
        sourceNodes: Array.from(skipped).filter((n) => !n.isSkipped),
        destinationNodes,
        skippedNodes: Array.from(skipped).filter((n) => n.isSkipped),
        hasBranchLabels: false,
      });
      if (last.isSkipped) {
        // Use placeholder to make room for curved connection.
        return destinationNodes;
      }
    }
    return computeConnections(last);
  };
  computeConnections(graph.root);
  const nodes: GraphNode[] = [];
  const table: {
    indent: number;
    maxWidth: number;
    maxDepth: number;
    x: number;
    y: number;
    key: string;
    type: string;
    hasParallel?: boolean;
    stage: false | StageType;
    name: string;
  }[] = [];
  const recurse = (node: GraphNode, indent = 0) => {
    nodes.push(node);
    table.push({
      indent,
      maxWidth: node.maxWidth,
      maxDepth: node.maxDepth,
      x: node.x,
      y: node.y,
      key: node.key,
      type: node.type,
      hasParallel: node.hasParallel,
      stage: "stage" in node && node.stage.type,
      name: node.name,
    });
    // console.log(
    //   indent,
    //   "width",
    //   node.maxWidth,
    //   "depth",
    //   node.maxDepth,
    //   "=".repeat(indent),
    //   node.key,
    //   "stage" in node && node.stage.type,
    //   node.name,
    // );
    for (const child of node.children) {
      recurse(child, indent + 1);
    }
  };
  recurse(graph.root);
  console.table(table);
  nodes.shift();

  const smallLabels: NodeLabelInfo[] = nodes
    .filter(() => !collapsed)
    .filter((node) => !node.isPlaceholder)
    .filter((node) => node.type !== "parallel" || node.children.length === 0)
    .filter((node) => !node.hasParallel)
    .map((node) => {
      return {
        x: node.x,
        y: node.y,
        text: node.name,
        key: "l_small_" + node.key,
        node,
        stage: node.stage,
      };
    });

  const branchLabels: NodeLabelInfo[] = nodes
    .filter(() => !collapsed)
    .filter((node) => !node.isPlaceholder)
    .filter((node) => node.type === "parallel" && node.children.length > 0)
    .map((node) => {
      return {
        // TODO
        x: node.x - sequentialStagesLabelOffset,
        y: node.y,
        key: "l_branch_" + node.key,
        node,
        text: node.stage.name,
      };
    });

  const bigLabels: NodeLabelInfo[] = nodes
    .filter(() => !(collapsed && !showNames))
    .filter((node) => node.type !== "counter")
    .filter((node) => node.isPlaceholder || node.hasParallel)
    .map((node) => {
      return {
        // TODO
        x: node.isPlaceholder
          ? node.x
          : node.x + (node.maxWidth - layout.nodeSpacingH) / 2,
        y: node.y,
        key: "l_big_" + node.key,
        node,
        stage: "stage" in node ? node.stage : undefined,
        text: node.name,
      };
    });

  console.log(newStages);
  console.log(graph);

  const measuredWidth = graph.root.maxWidth * 1.5; // TODO
  const measuredHeight = graph.root.maxDepth + layout.nodeSpacingV;

  return {
    nodes: nodes.filter(
      (node) =>
        !node.hasParallel &&
        !(node.type === "parallel" && node.children.length > 0),
    ),
    connections,
    smallLabels,
    bigLabels,
    branchLabels,
    measuredWidth,
    measuredHeight,
  };
}

type GraphNode = {
  children: GraphNode[];
  maxWidth: number;
  maxDepth: number;
  hasParallel?: boolean;
} & (
  | ({ type: "parallel" | "parallel-block-start" | "other" } & StageNodeInfo)
  | PlaceholderNodeInfo
);

type Graph = {
  limit: number;
  root: GraphNode;
  counterNode: GraphNode & CounterNodeInfo;
};

function collectCollapsed(stages: StageInfo[], graph: Graph) {
  for (const stage of stages) {
    if (graph.limit === 0) {
      graph.counterNode.stages.push(stage);
      continue;
    }
    graph.limit--;
    if (stage.type !== "PARALLEL_BLOCK") {
      // Hide "Parallel" stages
      graph.root.children.push({
        ...makeNodeForStage(stage),
        type: "other",
        maxWidth: 0,
        maxDepth: 0,
        children: [],
      });
    }
    collectCollapsed(stage.children, graph);
  }
}

function resolveDestination(node: GraphNode): GraphNode[] {
  if (node.hasParallel) {
    return node.children.flatMap((child) => resolveDestination(child));
  }
  return [node];
}

function collectNested(
  node: GraphNode,
  stages: StageInfo[],
  layout: LayoutInfo,
) {
  for (const stage of stages) {
    const childNode: GraphNode = {
      ...makeNodeForStage(
        stage,
        stage.type === "PARALLEL" ? stage.name : undefined,
      ),
      type:
        stage.type === "PARALLEL_BLOCK"
          ? "parallel-block-start"
          : stage.type === "PARALLEL"
            ? "parallel"
            : "other",
      isSkipped: stage.state === Result.skipped,
      hasParallel:
        stage.children.length > 0 && stage.children[0].type === "PARALLEL",
      maxWidth: layout.nodeSpacingH,
      maxDepth: layout.nodeSpacingV,
      children: [],
    };
    if (!childNode.isSkipped) {
      collectNested(childNode, stage.children, layout);
    }
    node.children.push(childNode);
    node.maxWidth = Math.max(node.maxWidth, childNode.maxWidth);
    node.maxDepth = Math.max(node.maxDepth, childNode.maxDepth);
  }
  if (
    node.type === "parallel" &&
    node.children.length > 0 &&
    node.children[0].isSkipped
  ) {
    node.maxWidth += layout.nodeSpacingH;
  }
  if (
    node.type !== "parallel" &&
    node.children.length > 0 &&
    node.children[node.children.length - 1].isSkipped
  ) {
    node.maxWidth += layout.nodeSpacingH;
  }
  if (node.hasParallel) {
    node.maxDepth += (node.children.length - 1) * layout.nodeSpacingV;
  } else {
    node.maxWidth +=
      node.children.filter((c) => !c.hasParallel).length * layout.nodeSpacingH;
  }
  if (node.children.some((child) => child.children.length > 0)) {
    node.maxWidth += sequentialStagesLabelOffset;
  }
}

/**
 * Main process for laying out the graph. Creates and positions markers for each component, but creates no components.
 *
 *  1. Creates nodes for each stage in the pipeline
 *  2. Position the nodes in columns for each top stage, and in rows within each column based on execution order
 *  3. Create all the connections between nodes that need to be rendered
 *  4. Create a bigLabel per column, and a smallLabel for any child nodes
 *  5. Measure the extent of the graph
 */
export function layoutGraph(
  newStages: Array<StageInfo>,
  layout: LayoutInfo,
  collapsed: boolean,
  messages: Messages,
  showNames: boolean,
  showDurations: boolean,
): PositionedGraph {
  const stageNodeColumns = createNodeColumns(newStages);
  const { nodeSpacingH, ypStart } = layout;

  const startNode: NodeInfo = {
    x: 0,
    y: 0,
    name: messages.format(LocalizedMessageKey.start),
    id: -1,
    isPlaceholder: true,
    key: "start-node",
    type: "start",
  };

  const endNode: NodeInfo = {
    x: 0,
    y: 0,
    name: messages.format(LocalizedMessageKey.end),
    id: -3,
    isPlaceholder: true,
    key: "end-node",
    type: "end",
  };

  const counterNode: CounterNodeInfo = {
    x: 0,
    y: 0,
    name: "Counter",
    id: -2,
    isPlaceholder: true,
    key: "counter-node",
    type: "counter",
    stages: [],
  };

  function flattenStageInfo(e: StageInfo): StageInfo[] {
    if (e.children.length) {
      const flattened: StageInfo[] =
        e.type !== "PARALLEL_BLOCK" ? [{ ...e, children: [] }] : [];
      return flattened.concat(
        e.children.flatMap((child) => flattenStageInfo(child)),
      );
    }
    return [e];
  }

  function flattenColumns(middleNodes: NodeColumn[]) {
    return middleNodes.flatMap((node) =>
      node.rows.flatMap((row) =>
        row.flatMap((e) => {
          const value = e as StageNodeInfo;
          return flattenStageInfo(value.stage);
        }),
      ),
    );
  }

  function filterWhenCollapsed(nodes: NodeColumn[]) {
    if (!collapsed) {
      return nodes;
    }

    const start = nodes[0];
    const end = nodes[nodes.length - 1];
    const counter = {
      rows: [[counterNode]],
      centerX: 0,
      hasBranchLabels: false,
      startX: 0,
    };

    const middleNodes = nodes.filter((node) => node !== start && node !== end);

    const middleStages = flattenColumns(middleNodes);

    const newMiddleNodes = createNodeColumns(middleStages);

    const visibleNodes = newMiddleNodes.slice(0, maxColumnsWhenCollapsed);
    const hiddenNodes = newMiddleNodes.slice(maxColumnsWhenCollapsed);

    const result = [start, ...visibleNodes];

    if (hiddenNodes.length > 0) {
      (counter.rows[0][0] as CounterNodeInfo).stages = hiddenNodes.flatMap(
        (node) =>
          node.rows.flatMap((row) =>
            row.flatMap((e) => (e as StageNodeInfo).stage),
          ),
      );
      result.push(counter);
    }

    result.push(end);
    return result;
  }

  const allNodeColumns: Array<NodeColumn> = filterWhenCollapsed([
    { rows: [[startNode]], centerX: 0, hasBranchLabels: false, startX: 0 }, // Column X positions calculated later
    ...stageNodeColumns,
    { rows: [[endNode]], centerX: 0, hasBranchLabels: false, startX: 0 },
  ]);

  positionNodes(allNodeColumns, layout);

  const bigLabels = createBigLabels(allNodeColumns, collapsed, showNames);
  const timings = createTimings(allNodeColumns, collapsed, showDurations);
  const smallLabels = createSmallLabels(allNodeColumns, collapsed);
  const branchLabels = createBranchLabels(allNodeColumns, collapsed);
  const connections = createConnections(allNodeColumns, collapsed);

  // Calculate the size of the graph
  let measuredWidth = 0;
  let measuredHeight = 60;

  for (const column of allNodeColumns) {
    for (const row of column.rows) {
      for (const node of row) {
        measuredWidth = Math.max(measuredWidth, node.x + nodeSpacingH / 2);
        measuredHeight =
          collapsed && !showNames && !showDurations
            ? 60
            : Math.max(measuredHeight, node.y + ypStart);
      }
    }
  }

  return {
    nodeColumns: allNodeColumns,
    connections,
    bigLabels,
    timings,
    smallLabels,
    branchLabels,
    measuredWidth,
    measuredHeight,
  };
}

export interface CounterNodeInfo extends PlaceholderNodeInfo {
  stages: StageInfo[];
}

function makeNodeForStage(
  stage: StageInfo,
  seqContainerName: string | undefined = undefined,
): StageNodeInfo {
  return {
    x: 0, // Layout is done later
    y: 0,
    name: stage.name,
    id: stage.id,
    stage,
    seqContainerName,
    isPlaceholder: false,
    key: "n_" + stage.id,
  };
}

/**
 * Generate an array of columns, based on the top-level stages
 */
export function createNodeColumns(
  topLevelStages: Array<StageInfo> = [],
): Array<NodeColumn> {
  const nodeColumns: Array<NodeColumn> = [];
  const processTopStage = (topStage: StageInfo, willRecurse: boolean) => {
    // If stage has children, we don't draw a node for it, just its children
    const stagesForColumn =
      !willRecurse && stageHasChildren(topStage)
        ? topStage.children
        : [{ ...topStage, children: [] }];

    const column: NodeColumn = {
      topStage,
      rows: [],
      centerX: 0, // Layout is done later
      startX: 0,
      hasBranchLabels: false, // set below
    };

    for (const nodeStage of stagesForColumn) {
      const rowNodes: Array<NodeInfo> = [];
      if (!willRecurse && stageHasChildren(nodeStage)) {
        column.hasBranchLabels = true;
        forEachChildStage(nodeStage, (parentStage, childStage, _) =>
          rowNodes.push(makeNodeForStage(childStage, parentStage.name)),
        );
      } else {
        rowNodes.push(makeNodeForStage(nodeStage));
      }
      column.rows.push(rowNodes);
    }

    nodeColumns.push(column);
  };

  for (const protoTopStage of topLevelStages) {
    const selfParentTopStage = { ...protoTopStage, children: [protoTopStage] };

    forEachChildStage(selfParentTopStage, (_, topStage, willRecurse) =>
      processTopStage(topStage, willRecurse),
    );
  }

  return nodeColumns;
}

/**
 * Check if stage has children.
 */
function stageHasChildren(stage: StageInfo): boolean {
  return !!(stage.children && stage.children.length);
}

/**
 * Walk the children of the stage recursively (depth first), invoking callback for each child.
 *
 * Don't recurse into parallel children as those are processed separately.
 * If one child of the stage is parallel, we assume all of its children are.
 */
function forEachChildStage(
  topStage: StageInfo,
  callback: (parent: StageInfo, child: StageInfo, willRecurse: boolean) => void,
) {
  if (!stageHasChildren(topStage)) {
    return;
  }
  for (const stage of topStage.children) {
    const needToRecurse =
      stageHasChildren(stage) && stage.children[0].type !== "PARALLEL";
    callback(topStage, stage, needToRecurse);
    if (needToRecurse) {
      forEachChildStage(stage, callback);
    }
  }
}

/**
 * Walks the columns of nodes giving them x and y positions. Mutates the node objects in place for now.
 */
function positionNodes(
  nodeColumns: Array<NodeColumn>,
  { nodeSpacingH, parallelSpacingH, nodeSpacingV, ypStart }: LayoutInfo,
) {
  let xp = nodeSpacingH / 2;
  let previousTopNode: NodeInfo | undefined;

  for (const column of nodeColumns) {
    const topNode = column.rows[0][0];

    let yp = ypStart; // Reset Y to top for each column

    if (previousTopNode) {
      // Advance X position
      xp += nodeSpacingH;
    }

    let widestRow = 0;
    for (const row of column.rows) {
      widestRow = Math.max(widestRow, row.length);
    }

    const xpStart = xp; // Remember the left-most position in this column

    // Make room for row labels
    if (column.hasBranchLabels) {
      xp += sequentialStagesLabelOffset;
    }

    let maxX = xp;

    for (const row of column.rows) {
      let nodeX = xp; // Start nodes at current column xp (not xpstart as that includes branch label)

      // Offset the beginning of narrower rows towards column center
      nodeX += Math.round((widestRow - row.length) * parallelSpacingH * 0.5);

      for (const node of row) {
        maxX = Math.max(maxX, nodeX);
        node.x = nodeX;
        node.y = yp;
        nodeX += parallelSpacingH; // Space out nodes in each row
      }

      yp += nodeSpacingV; // LF
    }

    column.centerX = Math.round((xpStart + maxX) / 2);
    column.startX = xpStart; // Record on column for use later to position branch labels
    xp = maxX; // Make sure we're at the end of the widest row for this column before next loop

    previousTopNode = topNode;
  }
}

/**
 * Generate label descriptions for big labels at the top of each column
 */
function createBigLabels(
  columns: Array<NodeColumn>,
  collapsed: boolean,
  showNames: boolean,
): Array<NodeLabelInfo> {
  const labels: Array<NodeLabelInfo> = [];

  if (collapsed && !showNames) {
    return [];
  }

  for (const column of columns) {
    const node = column.rows[0][0];

    if (node.isPlaceholder && node.type === "counter") {
      continue;
    }
    const stage = column.topStage;
    const text = stage ? stage.name : node.name;
    const key = "l_b_" + node.key;

    // bigLabel is located above center of column, but offset if there's branch labels
    let x = column.centerX;
    if (column.hasBranchLabels) {
      x += Math.floor(sequentialStagesLabelOffset / 2);
    }

    labels.push({
      x,
      y: node.y,
      node,
      stage,
      text,
      key,
    });
  }

  return labels;
}

/**
 * Generate label descriptions for big labels at the top of each column
 */
function createTimings(
  columns: Array<NodeColumn>,
  collapsed: boolean,
  showDurations: boolean,
): Array<NodeLabelInfo> {
  const labels: Array<NodeLabelInfo> = [];

  if (!collapsed || !showDurations) {
    return [];
  }

  for (const column of columns) {
    const node = column.rows[0][0];
    if (node.isPlaceholder) {
      continue;
    }
    const stage = column.topStage;

    labels.push({
      x: column.centerX,
      y: node.y + 55,
      node,
      stage,
      text: "", // we take the duration from the stage itself at render time
      key: `l_t_${node.key}`,
    });
  }

  return labels;
}

/**
 * Generate label descriptions for small labels under the nodes
 */
function createSmallLabels(
  columns: Array<NodeColumn>,
  collapsed: boolean,
): Array<NodeLabelInfo> {
  const labels: Array<NodeLabelInfo> = [];
  if (collapsed) {
    return labels;
  }
  for (const column of columns) {
    for (const row of column.rows) {
      for (const node of row) {
        // We add small labels to parallel nodes only so skip others
        if (node.isPlaceholder || node.stage.id === column.topStage?.id) {
          continue;
        }
        const label: NodeLabelInfo = {
          x: node.x,
          y: node.y,
          text: node.name,
          key: "l_s_" + node.key,
          node,
        };

        if (!node.isPlaceholder) {
          label.stage = node.stage;
        }

        labels.push(label);
      }
    }
  }

  return labels;
}

/**
 * Generate label descriptions for named sequential parallels
 */
function createBranchLabels(
  columns: Array<NodeColumn>,
  collapsed: boolean,
): Array<NodeLabelInfo> {
  const labels: Array<NodeLabelInfo> = [];
  if (collapsed) {
    return labels;
  }
  let count = 0;

  for (const column of columns) {
    if (column.hasBranchLabels) {
      for (const row of column.rows) {
        const firstNode = row[0];
        if (!firstNode.isPlaceholder && firstNode.seqContainerName) {
          labels.push({
            x: column.startX,
            y: firstNode.y,
            key: `branchLabel-${++count}`,
            node: firstNode,
            text: firstNode.seqContainerName,
          });
        }
      }
    }
  }

  return labels;
}

/**
 * Generate connection information from column to column
 */
function createConnections(
  columns: Array<NodeColumn>,
  collapsed: boolean,
): Array<CompositeConnection> {
  const connections: Array<CompositeConnection> = [];

  let sourceNodes: Array<NodeInfo> = [];
  let skippedNodes: Array<NodeInfo> = [];

  for (const column of columns) {
    if (!collapsed && column.topStage?.state === Result.skipped) {
      skippedNodes.push(column.rows[0][0]);
      continue;
    }

    // Connections to each row in this column
    if (sourceNodes.length) {
      connections.push({
        sourceNodes,
        destinationNodes: column.rows.map((row) => row[0]), // First node of each row
        skippedNodes,
        hasBranchLabels: column.hasBranchLabels,
      });
    }

    // Simple horizontal connections between nodes within each row
    for (const row of column.rows) {
      for (let i = 0; i < row.length - 1; i++) {
        connections.push({
          sourceNodes: [row[i]],
          destinationNodes: [row[i + 1]],
          skippedNodes: [],
          hasBranchLabels: false,
        });
      }
    }

    sourceNodes = column.rows.map((row) => row[row.length - 1]); // Last node of each row
    skippedNodes = [];
  }

  return connections;
}
