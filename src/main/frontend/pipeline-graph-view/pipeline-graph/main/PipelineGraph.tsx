import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { I18NContext } from "../../../common/i18n/index.ts";
import { useUserPreferences } from "../../../common/user/user-preferences-provider.tsx";
import { layoutGraph, layoutGraph2 } from "./PipelineGraphLayout";
import {
  CompositeConnection,
  defaultLayout,
  LayoutInfo,
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
import { Node, SelectionHighlight } from "./support/nodes.tsx";

export function PipelineGraph({
  stages = [],
  layout,
  selectedStage,
  collapsed,
  onStageSelect,
}: Props) {
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
    if (window.location.search.includes("new-layout=true")) {
      const layout2 = layoutGraph2(
        stages,
        fullLayout,
        collapsed ?? false,
        messages,
        showNames,
        showDurations,
      );
      setNodes(layout2.nodes);
      setConnections(layout2.connections);
      setSmallLabels(layout2.smallLabels);
      setBigLabels(layout2.bigLabels);
      setBranchLabels(layout2.branchLabels);
      setMeasuredWidth(layout2.measuredWidth);
      setMeasuredHeight(layout2.measuredHeight);

      const newLayout = layoutGraph(
        stages,
        fullLayout,
        collapsed ?? false,
        messages,
        showNames,
        showDurations,
      );
      console.log(layout2.nodes);
      console.log(newLayout.nodeColumns);
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

  useEffect(() => {
    if (connections.length === 0) return;
    console.table(
      connections.map((connection) => ({
        sourceNode: connection.sourceNodes
          .map((node) => `${node.key} (${node.name})`)
          .join(","),
        destinationNode: connection.destinationNodes
          .map((node) => `${node.key} (${node.name})`)
          .join(","),
      })),
    );
  }, [connections]);

  const stageIsSelected = useCallback(
    (stage?: StageInfo): boolean => {
      return (selectedStage && stage && selectedStage.id === stage.id) || false;
    },
    [selectedStage],
  );

  const outerDivStyle = {
    position: "relative" as const,
    overflow: "visible" as const,
  };

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
