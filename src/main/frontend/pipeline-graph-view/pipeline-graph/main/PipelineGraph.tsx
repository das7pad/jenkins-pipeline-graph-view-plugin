import {
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { I18NContext } from "../../../common/i18n/index.ts";
import { useUserPreferences } from "../../../common/user/user-preferences-provider.tsx";
import { nestedGraphLayout } from "./NestedPipelineGraphLayout.ts";
import { layoutGraph } from "./PipelineGraphLayout";
import {
  CompositeConnection,
  debugPipelineGraph,
  defaultLayout,
  GraphNode,
  LayoutInfo,
  nestedLayout,
  NodeInfo,
  NodeLabelInfo,
  StageInfo,
} from "./PipelineGraphModel.tsx";
import { GraphConnections } from "./support/connections.tsx";
import {
  BigLabel,
  SequentialContainerLabel,
  SmallLabel,
  TimingsLabel,
} from "./support/labels.tsx";
import { DebugOutlines, Node, SelectionHighlight } from "./support/nodes.tsx";

export function PipelineGraph({
  stages = [],
  layout,
  selectedStage,
  collapsed,
  onStageSelect,
}: Props) {
  const [allGraphNodes, setAllGraphNodes] = useState<GraphNode[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [connections, setConnections] = useState<CompositeConnection[]>([]);
  const [bigLabels, setBigLabels] = useState<NodeLabelInfo[]>([]);
  const [timings, setTimings] = useState<NodeLabelInfo[]>([]);
  const [smallLabels, setSmallLabels] = useState<NodeLabelInfo[]>([]);
  const [branchLabels, setBranchLabels] = useState<NodeLabelInfo[]>([]);
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const [measuredHeight, setMeasuredHeight] = useState<number>(0);
  const fullLayout = useMemo(() => {
    return {
      ...defaultLayout,
      ...layout,
    };
  }, [layout]);
  const { showNames, showDurations } = useUserPreferences();

  const messages = useContext(I18NContext);

  useEffect(() => {
    if (nestedLayout()) {
      const result = nestedGraphLayout(
        stages,
        fullLayout,
        collapsed ?? false,
        messages,
        showNames || !collapsed,
        showDurations,
      );
      setNodes(result.nodes);
      setAllGraphNodes(result.allGraphNodes);
      setConnections(result.connections);
      setSmallLabels(result.smallLabels);
      setBigLabels(result.bigLabels);
      setBranchLabels(result.branchLabels);
      setTimings(result.timings);
      setMeasuredWidth(result.measuredWidth);
      setMeasuredHeight(result.measuredHeight);
      return;
    }

    const newLayout = layoutGraph(
      stages,
      fullLayout,
      collapsed ?? false,
      messages,
      showNames,
      showDurations,
    );
    setNodes(
      newLayout.nodeColumns.flatMap((column) => {
        return column.rows.flatMap((row) => row);
      }),
    );
    setConnections(newLayout.connections);
    setBigLabels(newLayout.bigLabels);
    setSmallLabels(newLayout.smallLabels);
    setTimings(newLayout.timings);
    setBranchLabels(newLayout.branchLabels);
    setMeasuredWidth(newLayout.measuredWidth);
    setMeasuredHeight(newLayout.measuredHeight);
  }, [stages, fullLayout, collapsed, messages, showNames, showDurations]);

  const stageIsSelected = useCallback(
    (stage?: StageInfo): boolean => {
      return (selectedStage && stage && selectedStage.id === stage.id) || false;
    },
    [selectedStage],
  );

  const outerDivStyle: CSSProperties = {
    position: "relative",
    overflow: "visible",
  };
  if (debugPipelineGraph()) {
    outerDivStyle.border = "1px dashed red";
  }

  return (
    <div className="PWGx-PipelineGraph-container">
      <div style={outerDivStyle} className="PWGx-PipelineGraph">
        <svg width={measuredWidth} height={measuredHeight}>
          <GraphConnections connections={connections} layout={fullLayout} />

          <SelectionHighlight
            layout={fullLayout}
            nodes={nodes}
            isStageSelected={stageIsSelected}
          />

          {debugPipelineGraph() && (
            <DebugOutlines layout={fullLayout} nodes={allGraphNodes} />
          )}
        </svg>

        {nodes.map((node) => (
          <Node
            key={node.id}
            node={node}
            collapsed={collapsed}
            isSelected={
              node.isPlaceholder ? false : selectedStage?.id === node.stage.id
            }
            onStageSelect={onStageSelect}
          />
        ))}

        {bigLabels.map((label) => (
          <BigLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            measuredHeight={measuredHeight}
            isSelected={selectedStage?.id === label.stage?.id}
          />
        ))}

        {timings.map((label) => (
          <TimingsLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            measuredHeight={measuredHeight}
            isSelected={selectedStage?.id === label.stage?.id}
          />
        ))}

        {smallLabels.map((label) => (
          <SmallLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            isSelected={selectedStage?.id === label.stage?.id}
          />
        ))}

        {branchLabels.map((label) => (
          <SequentialContainerLabel
            key={label.key}
            details={label}
            layout={fullLayout}
          />
        ))}
      </div>
    </div>
  );
}

interface Props {
  stages: Array<StageInfo>;
  layout?: Partial<LayoutInfo>;
  selectedStage?: StageInfo;
  collapsed?: boolean;
  onStageSelect?: (nodeId: string) => void;
}
