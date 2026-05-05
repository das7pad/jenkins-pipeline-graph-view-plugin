import { LocalizedMessageKey, Messages } from "../../../common/i18n/index.ts";
import {
  CompositeConnection,
  debugPipelineGraph,
  GraphNode,
  LayoutInfo,
  NewPositionedGraph,
  NodeColumn,
  NodeInfo,
  NodeLabelInfo,
  PlaceholderNodeInfo,
  PositionedGraph,
  Result,
  StageInfo,
  StageNodeInfo,
} from "./PipelineGraphModel.tsx";

const maxColumnsWhenCollapsed = 13;

export function newLayoutGraph(
  newStages: Array<StageInfo>,
  layout: LayoutInfo,
  collapsed: boolean,
  messages: Messages,
  showNames: boolean,
  showDurations: boolean,
): NewPositionedGraph {
  const graph: Graph = {
    limit: collapsed ? maxColumnsWhenCollapsed : -1,
    root: {
      x: layout.nodeSpacingH / 2,
      y: 0,
      shiftX: 0,
      width: layout.nodeSpacingH,
      height: layout.nodeSpacingV,
      shiftY: 0,
      name: "Root",
      id: -42,
      key: "root",
      isPlaceholder: true,
      type: "root",
      children: [
        {
          x: 0,
          y: 0,
          shiftX: 0,
          width: layout.nodeSpacingH,
          height: layout.nodeSpacingV,
          shiftY: layout.labelOffsetV,
          name: messages.format(LocalizedMessageKey.start),
          id: -1,
          isPlaceholder: true,
          key: "start-node",
          type: "start",
          children: [],
          hasBigLabel: showNames,
        },
      ],
    },
    counterNode: {
      x: 0,
      y: 0,
      shiftX: 0,
      width: layout.nodeSpacingH,
      height: layout.nodeSpacingV,
      shiftY: layout.labelOffsetV,
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
    collectCollapsed(newStages, graph, layout, showNames, showDurations, 0);
    if (graph.counterNode.stages.length > 0) {
      graph.root.children.push(graph.counterNode);
    }
    graph.root.width = sumGraphNodeProp(graph.root, "width");
  } else {
    collectNested(graph.root, newStages, layout, showNames);
  }
  graph.root.y = Math.max(
    layout.ypStart,
    graph.root.shiftY +
      (showNames ? layout.nodeRadius + layout.labelOffsetV : 0),
  );
  graph.root.width += layout.nodeSpacingH;
  graph.root.children.push({
    x: 0,
    y: 0,
    shiftX: 0,
    width: layout.nodeSpacingH,
    height: layout.nodeSpacingV,
    shiftY: layout.labelOffsetV,
    name: messages.format(LocalizedMessageKey.end),
    id: -3,
    isPlaceholder: true,
    key: "end-node",
    type: "end",
    children: [],
    hasBigLabel: showNames,
  });

  const computePositions = (node: GraphNode, extraXp: number) => {
    if (node.children.length === 0) return;
    extraXp += node.shiftX;
    let xP = node.x + extraXp;
    let yP = node.y;
    for (const [i, child] of node.children.entries()) {
      child.x = xP;
      child.y = yP;
      if (child.type === "stage-end") {
        child.x -= layout.nodeSpacingH / 2;
      }
      let childExtraXp = 0;
      if (node.hasParallel) {
        if (i > 0) {
          // Skip first child: The entire node has been moved already by children[0].shiftY.
          child.y += child.shiftY;
          yP += child.shiftY;
        }
        yP += child.height;
        childExtraXp = toMultipleOf(
          (node.width - extraXp - child.width) / 2,
          layout.nodeSpacingH,
        );
        if (child.children.length === 0) {
          child.x += childExtraXp;
          childExtraXp = 0;
        }
      } else {
        xP += child.width;
      }
      computePositions(child, childExtraXp);
    }
  };
  computePositions(graph.root, 0);

  const connections: CompositeConnection[] = [];
  const computeConnections = (node: GraphNode): GraphNode[] => {
    if (node.children.length === 0) {
      return [node];
    }
    if (node.hasParallel) {
      return node.children.flatMap((child) => computeConnections(child));
    }
    // Collect nodes in a Set. With two skipped nodes next to each other, we need to deduplicate them.
    const sourceNodes = new Set<GraphNode>();
    const skippedNodes = new Set<GraphNode>();
    const connect = (
      tailNodes: GraphNode[],
      destination: GraphNode,
      ignoreSkipped?: boolean,
    ) => {
      for (const node of tailNodes) {
        if (ignoreSkipped || !node.isSkipped) {
          sourceNodes.add(node);
        } else {
          skippedNodes.add(node);
        }
      }
      const destinationNodes = resolveDestination(destination);
      if (!destinationNodes.some((n) => !n.isSkipped)) {
        for (const node of destinationNodes) {
          skippedNodes.add(node);
        }
        return;
      }
      connections.push({
        sourceNodes: Array.from(sourceNodes),
        destinationNodes,
        skippedNodes: Array.from(skippedNodes),
        hasBranchLabels: destinationNodes.some((n) => n.hasBranchLabel),
      });
      sourceNodes.clear();
      skippedNodes.clear();
    };
    if (node.type !== "root") {
      connect([node], node.children[0], true);
    }
    for (let i = 0; i < node.children.length - 1; i++) {
      const childA = node.children[i];
      const childB = node.children[i + 1];
      connect(
        computeConnections(childA),
        childB,
        // Honor skipped state per layer, but not across layers.
        childA.hasParallel,
      );
    }
    const last = node.children[node.children.length - 1];
    if (last.isSkipped || skippedNodes.size > 0 || sourceNodes.size > 0) {
      throw new Error("bug: collectNested did not add trailing dummy node");
    }
    return computeConnections(last);
  };
  computeConnections(graph.root);

  const flattenGraph = (node: GraphNode): GraphNode[] => {
    return node.children.concat(...node.children.map(flattenGraph));
  };
  const nodes = flattenGraph(graph.root);
  const visibleNodes = nodes.filter(
    (node) =>
      node.type !== "stage-end" &&
      !node.hasParallel &&
      !node.hasBranchLabel &&
      node.type !== "chained-parallel",
  );

  const smallLabels: NodeLabelInfo[] = visibleNodes
    .filter((node) => node.hasSmallLabel)
    .map((node) => {
      return {
        x: node.x,
        y: node.y,
        text: node.name,
        key: "l_small_" + node.key,
        node,
        stage: "stage" in node ? node.stage : undefined,
      };
    });

  const branchLabels: NodeLabelInfo[] = nodes
    .filter((node) => node.hasBranchLabel)
    .map((node) => {
      return {
        x: node.x - layout.nodeSpacingH,
        y: node.y,
        key: "l_branch_" + node.key,
        node,
        text: node.name,
      };
    });

  const bigLabels: NodeLabelInfo[] = nodes
    .filter((node) => node.hasBigLabel)
    .map((node) => {
      return {
        x:
          node.x +
          toMultipleOf(
            node.width > layout.nodeSpacingH ? node.width / 2 : 0,
            layout.nodeSpacingH / 2,
          ),
        y: node.y - (node.shiftY - layout.labelOffsetV),
        key: "l_big_" + node.key,
        node,
        stage: "stage" in node ? node.stage : undefined,
        text: node.name,
      };
    });

  const timings: NodeLabelInfo[] = nodes
    .filter((node) => node.hasTiming)
    .map((node) => {
      return {
        x:
          node.x +
          toMultipleOf(
            (node.width - layout.nodeSpacingH) / 2,
            layout.nodeSpacingH / 2,
          ),
        y: node.y + 55,
        node,
        stage: "stage" in node ? node.stage : undefined,
        text: "", // we take the duration from the stage itself at render time
        key: `l_t_${node.key}`,
      };
    });

  const measuredWidth = graph.root.width;
  const measuredHeight = graph.root.y + graph.root.height;

  const debug = debugPipelineGraph();
  if (debug) {
    printDebugInfo(newStages, graph, nodes, connections);
  }
  return {
    nodes: debug ? nodes : visibleNodes,
    allGraphNodes: [graph.root].concat(nodes),
    connections,
    smallLabels,
    bigLabels,
    branchLabels,
    timings,
    measuredWidth,
    measuredHeight,
  };
}

function printDebugInfo(
  newStages: Array<StageInfo>,
  graph: Graph,
  nodes: GraphNode[],
  connections: CompositeConnection[],
) {
  console.log("JSON.stringify(newStages)", JSON.stringify(newStages));
  console.log("newStages", newStages);
  console.log("graph", graph);
  console.table(
    [graph.root]
      .concat(nodes)
      .map((n) => ({ ...n, stage: "stage" in n && n.stage.type })),
    [
      "width",
      "height",
      "shiftY",
      "shiftX",
      "x",
      "y",
      "key",
      "type",
      "hasParallel",
      "hasBranchLabel",
      "stage",
      "name",
    ],
  );
  const joinNodeInfo = (v: NodeInfo[]) =>
    v.map((n) => `${n.key} (${n.name})`).join(",");
  console.table(
    connections.map((c) => ({
      sourceNodes: joinNodeInfo(c.sourceNodes),
      destinationNodes: joinNodeInfo(c.destinationNodes),
      skippedNodes: joinNodeInfo(c.skippedNodes),
      hasBranchLabels: c.hasBranchLabels,
    })),
  );
}

type Graph = {
  limit: number;
  root: GraphNode;
  counterNode: GraphNode & CounterNodeInfo;
};

function toMultipleOf(n: number, multiple: number): number {
  return Math.floor(n / multiple) * multiple;
}

function sumGraphNodeProp(
  node: GraphNode,
  prop: "width" | "shiftY" | "height" | "shiftX",
): number {
  return node.children.reduce((sum, c) => sum + c[prop], 0);
}

function maxGraphNodeProp(
  node: GraphNode,
  prop: "width" | "shiftY" | "height" | "shiftX",
): number {
  return Math.max(node[prop], ...node.children.map((c) => c[prop]));
}

function collectCollapsed(
  stages: StageInfo[],
  graph: Graph,
  layout: LayoutInfo,
  showNames: boolean,
  showDurations: boolean,
  level: number,
) {
  for (const stage of stages) {
    if (
      (!(stage.children.length > 0 && stage.children[0].type === "PARALLEL") &&
        !(stage.type === "PARALLEL" && stage.children.length > 0)) ||
      (level > 1 && stage.type !== "PARALLEL_BLOCK")
    ) {
      // Mirror filtering of old layout:
      // - Top level: Hide stages that wrap "PARALLEL" stages.
      // - Top level: Hide "PARALLEL" stages with children.
      // - Rest: Hide generic "PARALLEL_BLOCK" wrapper.
      if (graph.limit === 0) {
        graph.counterNode.stages.push(stage);
      } else {
        graph.limit--;
        graph.root.children.push({
          ...makeNodeForStage(stage),
          type: "other",
          shiftX: 0,
          width: layout.nodeSpacingH,
          height: layout.nodeSpacingV,
          shiftY: layout.labelOffsetV,
          children: [],
          hasBigLabel: showNames,
          hasTiming: showDurations,
        });
      }
    }
    collectCollapsed(
      stage.children,
      graph,
      layout,
      showNames,
      showDurations,
      level + 1,
    );
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
  showNames: boolean,
) {
  if (node.isSkipped || stages.length === 0) return;
  for (let [idx, stage] of stages.entries()) {
    const isParallel = stage.type === "PARALLEL";
    let hasParallel =
      stage.children.length > 0 && stage.children[0].type === "PARALLEL";
    const isChainedParallel = isParallel && hasParallel;
    if (isChainedParallel) {
      // turn PARALLEL -> PARALLEL into PARALLEL -> STAGE -> PARALLEL
      // PARALLEL[PARALLEL] -> PARALLEL[STAGE[PARALLEL,stage-end]]
      stage = {
        ...stage,
        id: -stage.id,
        children: [{ ...stage, type: "STAGE" }],
      };
      hasParallel = false;
    }
    const isSkipped = stage.state === Result.skipped;
    let hasBigLabel = hasParallel || (isSkipped && stage.type !== "PARALLEL");
    let hasSmallLabel = !hasBigLabel;
    let hasBranchLabel = isParallel && stage.children.length > 0;
    if (
      isParallel &&
      stage.children.length === 1 &&
      stage.children[0].children.length > 0 &&
      stage.children[0].children[0].type === "PARALLEL" &&
      stage.name === stage.children[0].name
    ) {
      // Do not add any labels. Show a big label on the nested parallel block.
      hasBigLabel = false;
      hasSmallLabel = false;
      hasBranchLabel = false;
    }
    const childNode: GraphNode = {
      ...makeNodeForStage(stage),
      type: isChainedParallel ? "chained-parallel" : "other",
      isSkipped,
      hasParallel,
      hasBranchLabel,
      hasBigLabel,
      hasSmallLabel,
      width: layout.nodeSpacingH,
      height: layout.nodeSpacingV,
      shiftY: 0,
      shiftX: 0,
      children: [],
    };
    collectNested(childNode, stage.children, layout, showNames);
    if (hasBigLabel) childNode.shiftY += layout.labelOffsetV;
    if (
      childNode.hasParallel &&
      (node.hasParallel ||
        idx === 0 ||
        childNode.children.some((c) => c.hasBranchLabel))
    ) {
      childNode.shiftX += layout.nodeSpacingH;
      childNode.width += layout.nodeSpacingH;
    }
    node.children.push(childNode);
  }
  if (node.hasParallel) {
    // Move shiftY from first parallel child up one level.
    const inheritedShift = node.children[0].shiftY;
    node.shiftY = inheritedShift;
    node.width = maxGraphNodeProp(node, "width");
    node.height =
      sumGraphNodeProp(node, "height") +
      sumGraphNodeProp(node, "shiftY") -
      inheritedShift;
  } else {
    node.width = sumGraphNodeProp(node, "width");
    node.height = maxGraphNodeProp(node, "height");
    node.shiftY = maxGraphNodeProp(node, "shiftY");
  }
  const last = node.children[node.children.length - 1];
  if (!node.hasParallel && (last.isSkipped || last.hasParallel)) {
    // - Add a dummy node to "close" the skipped curve before closing the stage.
    // - Add a dummy node to "close" the parallel curve of the child.
    // In both cases, the dummy node will be the new stage end that is connected to the next node.
    node.width += layout.nodeSpacingH / 2;
    node.children.push({
      isPlaceholder: true,
      type: "stage-end",
      key: `stage_end_${node.key}`,
      x: 0,
      y: 0,
      shiftX: 0,
      name: `Stage end (${node.name})`,
      id: 1_000_000 + node.id,
      width: 0,
      height: layout.nodeSpacingV,
      shiftY: 0,
      children: [],
    });
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

  const bigLabels = createBigLabels(
    allNodeColumns,
    collapsed,
    showNames,
    layout,
  );
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
      xp += nodeSpacingH;
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
  layout: LayoutInfo,
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
      x += Math.floor(layout.nodeSpacingH / 2);
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
