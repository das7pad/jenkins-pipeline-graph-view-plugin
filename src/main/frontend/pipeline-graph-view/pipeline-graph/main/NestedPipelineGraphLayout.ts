import { LocalizedMessageKey, Messages } from "../../../common/i18n/index.ts";
import {
  CompositeConnection,
  ConnectionEdge,
  debugPipelineGraph,
  GraphNode,
  LayoutInfo,
  NestedPositionedGraph,
  NodeLabelInfo,
  Result,
  StageInfo,
} from "./PipelineGraphModel.tsx";

const maxColumnsWhenCollapsed = 13;

export function nestedGraphLayout(
  newStages: Array<StageInfo>,
  layout: LayoutInfo,
  collapsed: boolean,
  messages: Messages,
  showNames: boolean,
  showDurations: boolean,
): NestedPositionedGraph {
  const root: GraphNode = {
    ...baseGraphNode(layout),
    shiftX: layout.nodeSpacingH / 2,
    isPlaceholder: true,
    type: "root",
    name: "Root",
    key: "root",
    id: -42,
    children: [
      {
        ...baseGraphNode(layout, showNames),
        isPlaceholder: true,
        type: "start",
        name: messages.format(LocalizedMessageKey.start),
        key: "start-node",
        id: -1,
      },
    ],
  };
  if (collapsed) {
    const collapsedStages: StageInfo[] = [];
    collectCollapsed(collapsedStages, newStages, 0);
    const breakPoint =
      collapsedStages.length > maxColumnsWhenCollapsed
        ? maxColumnsWhenCollapsed - 1 // Make space for counter node.
        : collapsedStages.length;
    root.children.push(
      ...collapsedStages.slice(0, breakPoint).map((stage: StageInfo) => ({
        ...makeNodeForStage(stage, layout, showNames),
        hasTiming: showDurations,
      })),
    );
    if (collapsedStages.length > breakPoint) {
      root.children.push({
        ...baseGraphNode(layout),
        isPlaceholder: true,
        type: "counter",
        name: "Counter",
        key: "counter-node",
        id: -2,
        stages: collapsedStages.slice(breakPoint),
      });
    }
    root.width = sumGraphNodeProp(root, "width");
  } else {
    collectNested(root, newStages, layout, showNames);
  }
  root.y = Math.max(
    layout.ypStart,
    root.shiftY + (showNames ? layout.nodeRadius + layout.labelOffsetV : 0),
  );

  root.width += layout.nodeSpacingH;
  root.children.push({
    ...baseGraphNode(layout, showNames),
    isPlaceholder: true,
    type: "end",
    name: messages.format(LocalizedMessageKey.end),
    key: "end-node",
    id: -3,
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
        // Shift child close to center, prefer closer to start than end.
        childExtraXp = floorToMultipleOf(
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
  computePositions(root, 0);

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
  computeConnections(root);

  const flattenGraph = (node: GraphNode): GraphNode[] => {
    return node.children.concat(...node.children.map(flattenGraph));
  };
  const nodes = flattenGraph(root);
  const visibleNodes = nodes.filter((node) => !node.isHidden);

  const smallLabels = visibleNodes
    .filter((node) => node.hasSmallLabel)
    .map((node): NodeLabelInfo => {
      return {
        x: node.x,
        y: node.y,
        text: node.name,
        key: "l_small_" + node.key,
        node,
        stage: "stage" in node ? node.stage : undefined,
      };
    });

  const branchLabels = nodes
    .filter((node) => node.hasBranchLabel)
    .map((node): NodeLabelInfo => {
      return {
        x: node.x - layout.nodeSpacingH,
        y: node.y,
        key: "l_branch_" + node.key,
        node,
        text: node.name,
      };
    });

  const bigLabels = nodes
    .filter((node) => node.hasBigLabel)
    .map((node): NodeLabelInfo => {
      return {
        x: centerOfNode(node, layout),
        y: node.y - (node.shiftY - layout.labelOffsetV),
        key: "l_big_" + node.key,
        node,
        stage: "stage" in node ? node.stage : undefined,
        text: node.name,
      };
    });

  const timings = nodes
    .filter((node) => node.hasTiming)
    .map((node): NodeLabelInfo => {
      return {
        x: centerOfNode(node, layout),
        y: node.y + 55,
        node,
        stage: "stage" in node ? node.stage : undefined,
        text: "", // we take the duration from the stage itself at render time
        key: `l_t_${node.key}`,
      };
    });

  const measuredWidth = root.width;
  const measuredHeight = root.y + root.height;

  const allGraphNodes = [root, ...nodes];
  const debug = debugPipelineGraph();
  if (debug) {
    printDebugInfo(newStages, root, allGraphNodes, connections);
  }
  return {
    nodes: debug ? nodes : visibleNodes,
    allGraphNodes,
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
  root: GraphNode,
  nodes: GraphNode[],
  connections: CompositeConnection[],
) {
  console.log("JSON.stringify(newStages)", JSON.stringify(newStages));
  console.log(
    "For test snapshot",
    JSON.stringify(
      newStages.map(function forTestSnapshot(stage: StageInfo): any {
        return {
          name: stage.name,
          state: stage.state,
          id: stage.id,
          type: stage.type,
          children: stage.children.map(forTestSnapshot),
        };
      }),
    ),
  );
  console.log("newStages", newStages);
  for (const node of nodes) {
    removeFalselyGraphNodeFields(node);
  }
  console.log("graph root", root);
  console.table(
    nodes.map((n) => ({ ...n, stage: "stage" in n && n.stage.type })),
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

  const joinEdges = (ee: ConnectionEdge[]) =>
    ee
      .map((e) => {
        const node = nodes.find((n) => n.key === e.key);
        return `${e.key} (${node?.name})`;
      })
      .join(",");
  console.table(
    connections.map((c) => ({
      sourceNodes: joinEdges(c.sourceNodes),
      destinationNodes: joinEdges(c.destinationNodes),
      skippedNodes: joinEdges(c.skippedNodes),
      hasBranchLabels: c.hasBranchLabels,
    })),
  );
}

export function removeFalselyGraphNodeFields(node: GraphNode) {
  if (!node.isParallel) delete node.isParallel;
  if (!node.isSkipped) delete node.isSkipped;
  if (!node.isHidden) delete node.isHidden;
  if (!node.hasParallel) delete node.hasParallel;
  if (!node.hasBranchLabel) delete node.hasBranchLabel;
  if (!node.hasBigLabel) delete node.hasBigLabel;
  if (!node.hasSmallLabel) delete node.hasSmallLabel;
  if (!node.firstChildIsSkipped) delete node.firstChildIsSkipped;
}

function floorToMultipleOf(n: number, multiple: number): number {
  return Math.floor(n / multiple) * multiple;
}

function roundToMultipleOf(n: number, multiple: number): number {
  return Math.round(n / multiple) * multiple;
}

function centerOfNode(node: GraphNode, layout: LayoutInfo) {
  return (
    node.x +
    roundToMultipleOf(node.width / 2, layout.nodeSpacingH / 2) -
    layout.nodeSpacingH / 2
  );
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
  collapsedStages: StageInfo[],
  stages: StageInfo[],
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
      collapsedStages.push(stage);
    }
    collectCollapsed(collapsedStages, stage.children, level + 1);
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
  for (let stage of stages) {
    const isParallel = stage.type === "PARALLEL";
    const hasChildren = stage.children.length > 0;
    let hasParallel = hasChildren && stage.children[0].type === "PARALLEL";
    if (isParallel && hasParallel) {
      // Turn PARALLEL -> PARALLEL into PARALLEL -> PARALLEL_BLOCK -> PARALLEL.
      // This allows for a stage-end node to be inserted after the parallel children.
      // PARALLEL[PARALLEL, ...] -> PARALLEL[PARALLEL_BLOCK[PARALLEL, ...],stage-end]
      stage = {
        ...stage,
        id: -stage.id,
        children: [{ ...stage, type: "PARALLEL_BLOCK" }],
      };
      hasParallel = false;
    }
    const isChainedParallel =
      isParallel &&
      stage.children.length === 1 &&
      stage.children[0].children.length > 0 &&
      stage.children[0].children[0].type === "PARALLEL" &&
      stage.name === stage.children[0].name;
    const isSkipped = stage.state === Result.skipped;
    const firstChildIsSkipped =
      hasChildren && stage.children[0].state === Result.skipped;

    const hasBigLabel =
      hasParallel ||
      // Do not add a big label to parallel skipped stages. Only use one when we show a "skipped", curved connection.
      (isSkipped && !isParallel);
    const hasSmallLabel = !hasBigLabel;
    const hasBranchLabel =
      isParallel &&
      hasChildren &&
      // Do not add a branch label on the parent of a nested parallel. Instead, show a big label on the nested parallel block.
      !isChainedParallel;
    const isHidden = hasBranchLabel || hasParallel || isChainedParallel;
    const childNode: GraphNode = {
      ...makeNodeForStage(stage, layout),
      isParallel,
      isSkipped,
      isHidden,
      hasParallel,
      hasBranchLabel,
      hasBigLabel,
      hasSmallLabel,
      firstChildIsSkipped,
    };
    collectNested(childNode, stage.children, layout, showNames);
    if (hasBigLabel) childNode.shiftY += layout.labelOffsetV;
    if (
      isChainedParallel ||
      (childNode.hasParallel &&
        childNode.children.some((c) => c.hasBranchLabel))
    ) {
      // - Nested parallel children, avoid collapsing curves.
      // - Any child has branch label, make space for branch label.
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
  if (
    !node.hasParallel &&
    (last.isSkipped || last.hasParallel) &&
    node.type !== "root"
  ) {
    // - Add a dummy node to "close" the skipped curve before closing the stage.
    // - Add a dummy node to "close" the parallel curve of the child.
    // In both cases, the dummy node will be the new stage end that is connected to the next node.
    node.width += layout.nodeSpacingH / 2;
    node.children.push({
      ...baseGraphNode(layout),
      width: 0,
      isPlaceholder: true,
      type: "stage-end",
      key: `stage_end_${node.key}`,
      name: `Stage end (${node.name})`,
      id: 1_000_000 + node.id,
      isHidden: true,
    });
  }
}

function baseGraphNode(layout: LayoutInfo, hasBigLabel?: boolean) {
  return {
    children: [],
    x: 0,
    y: 0,
    shiftX: 0,
    shiftY: 0,
    width: layout.nodeSpacingH,
    height: layout.nodeSpacingV,
    ...(hasBigLabel ? { shiftY: layout.labelOffsetV, hasBigLabel: true } : {}),
  };
}

function makeNodeForStage(
  stage: StageInfo,
  layout: LayoutInfo,
  hasBigLabel?: boolean,
): GraphNode {
  return {
    ...baseGraphNode(layout, hasBigLabel),
    name: stage.name,
    id: stage.id,
    type: "stage",
    stage,
    isPlaceholder: false,
    key: "n_" + stage.id,
  };
}
