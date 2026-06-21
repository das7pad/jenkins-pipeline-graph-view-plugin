import "./stages.scss";

import {
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  getCenterPosition,
  ReactZoomPanPinchContextState,
  TransformComponent,
  TransformWrapper,
  useControls,
  useTransformEffect,
} from "react-zoom-pan-pinch";

import { COLLAPSE, EXPAND } from "../../../../common/components/symbols.tsx";
import Tooltip from "../../../../common/components/tooltip.tsx";
import {
  I18NContext,
  LocalizedMessageKey,
} from "../../../../common/i18n/index.ts";
import { classNames } from "../../../../common/utils/classnames.ts";
import { PipelineGraph } from "../../../../pipeline-graph-view/pipeline-graph/main/PipelineGraph.tsx";
import {
  LayoutInfo,
  StageInfo,
} from "../../../../pipeline-graph-view/pipeline-graph/main/PipelineGraphModel.tsx";
import { useCollapsedStages } from "../../../../pipeline-graph-view/pipeline-graph/main/support/useCollapsedStages.ts";
import { StageViewPosition } from "../providers/user-preference-provider.tsx";

const MAX_SCALE = 3;

export default function Stages({
  layout,
  stages,
  selectedStage,
  stageViewPosition,
  onStageSelect,
  onRunPage,
  normalizedParentJobPath,
  setAutoStageViewHeight,
  setPersistedStageViewHeight,
  setDefaultStageViewHeight,
  defaultStageViewHeight,
}: StagesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    collapsedStageIds,
    toggleCollapseStage,
    collapseAll,
    expandAll,
    hasCollapsibleStages,
    effectiveStages,
  } = useCollapsedStages(normalizedParentJobPath, stages, selectedStage?.id);

  const handleStageSelect = useCallback(
    (nodeId: string) => {
      onStageSelect?.(nodeId);
      setIsExpanded(false);
    },
    [onStageSelect],
  );

  const [initialScale, setInitialScale] = useState(1);
  const [minScale, setMinScale] = useState(0.75);

  return (
    <div
      className={classNames("pgv-stages-graph", {
        "pgv-stages-graph--left": stageViewPosition === StageViewPosition.LEFT,
        "pgv-stages-graph--dialog": isExpanded,
        "pvg-stages-graph--spacing-right": !onRunPage && !isExpanded,
      })}
    >
      {onRunPage && (
        <a
          className={"pgv-stages-graph__controls pgv-stages-graph__heading"}
          href="stages"
        >
          Stages
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="48"
              d="M184 112l144 144-144 144"
            />
          </svg>
        </a>
      )}
      <div className={"pgv-stages-graph__controls pgw-fullscreen-controls"}>
        <Tooltip content={isExpanded ? "Close" : "Expand"}>
          <button
            className={"jenkins-button jenkins-button--tertiary"}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded && (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="32"
                  d="M368 368L144 144M368 144L144 368"
                />
              </svg>
            )}
            {!isExpanded && (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 4H15C15.5523 4 16 4.44772 16 5V10M10 16H5C4.44772 16 4 15.5523 4 15V10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </Tooltip>
      </div>
      <TransformWrapper
        initialScale={initialScale}
        minScale={minScale}
        maxScale={MAX_SCALE}
        wheel={{ activationKeys: isExpanded ? [] : ["Control"] }}
      >
        <ZoomControls
          initialScale={initialScale}
          minScale={minScale}
          collapsedStageIds={collapsedStageIds}
          hasCollapsibleStages={hasCollapsibleStages}
          onCollapseAll={collapseAll}
          onExpandAll={expandAll}
          defaultStageViewHeight={defaultStageViewHeight}
          setAutoStageViewHeight={setAutoStageViewHeight}
          setPersistedStageViewHeight={setPersistedStageViewHeight}
        />

        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
          <PipelineGraph
            layout={layout}
            stages={effectiveStages}
            selectedStage={selectedStage}
            collapsedStageIds={collapsedStageIds}
            onToggleCollapse={toggleCollapseStage}
            setInitialScale={setInitialScale}
            setMinScale={setMinScale}
            setAutoStageViewHeight={setAutoStageViewHeight}
            setDefaultStageViewHeight={setDefaultStageViewHeight}
            {...(onStageSelect && { onStageSelect: handleStageSelect })}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

interface StagesProps {
  layout: Partial<LayoutInfo>;
  stages: StageInfo[];
  selectedStage?: StageInfo;
  stageViewPosition: StageViewPosition;
  onStageSelect?: (nodeId: string) => void;
  onRunPage?: boolean;
  normalizedParentJobPath: string;
  defaultStageViewHeight?: number;
  setAutoStageViewHeight?: Dispatch<SetStateAction<number>>;
  setDefaultStageViewHeight?: Dispatch<SetStateAction<number>>;
  setPersistedStageViewHeight?: Dispatch<SetStateAction<number>>;
}

interface ZoomControlsProps {
  initialScale: number;
  minScale: number;
  collapsedStageIds: Set<number>;
  hasCollapsibleStages: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  defaultStageViewHeight?: number;
  setAutoStageViewHeight?: Dispatch<SetStateAction<number>>;
  setPersistedStageViewHeight?: Dispatch<SetStateAction<number>>;
}

function ZoomControls({
  initialScale,
  minScale,
  collapsedStageIds,
  hasCollapsibleStages,
  onCollapseAll,
  onExpandAll,
  defaultStageViewHeight,
  setAutoStageViewHeight,
  setPersistedStageViewHeight,
}: ZoomControlsProps) {
  const {
    zoomIn,
    zoomOut,
    centerView,
    setTransform,
    instance: transform,
  } = useControls();
  const messages = useContext(I18NContext);
  const [scale, setScale] = useState(initialScale);
  const [isCentered, setIsCentered] = useState(true);
  const handleTransformEffect = useCallback(
    (ref: ReactZoomPanPinchContextState) => {
      setScale(ref.state.scale);
      if (ref.instance.wrapperComponent && ref.instance.contentComponent) {
        const center = getCenterPosition(
          ref.state.scale,
          ref.instance.wrapperComponent,
          ref.instance.contentComponent,
        );
        setIsCentered(
          Math.abs(center.positionX - ref.state.positionX) <= 1 &&
            Math.abs(center.positionY - ref.state.positionY) <= 1,
        );
      }
    },
    [],
  );
  useTransformEffect(handleTransformEffect);

  const reset = () => {
    if (
      setPersistedStageViewHeight &&
      setAutoStageViewHeight &&
      defaultStageViewHeight
    ) {
      // We need to perform three changes as part of a reset:
      //   1. unset any user override for the height
      //   2. reset the auto stage height
      //   3. center the view
      // 1+2. are asynchronous and 3. takes synchronous measurements of the DOM before animating asynchronously.
      // We cannot reliably know when 1+2. have propagated to the DOM (unless we watch ALL DOM changes, which is overkill).
      // Rather than fight with it, compute what 3. would do and adjust it for the diff vs 1/2.
      // This has the nice side effect of making the reset incrementally and animated (shift to center then reduce the height).
      setPersistedStageViewHeight((prevPersisted) => {
        setAutoStageViewHeight((prevAuto) => {
          const currentHeight = prevPersisted || prevAuto;
          const diff = currentHeight - defaultStageViewHeight;
          if (transform.wrapperComponent && transform.contentComponent) {
            const center = getCenterPosition(
              initialScale,
              transform.wrapperComponent,
              transform.contentComponent,
            );
            setTransform(
              center.positionX,
              center.positionY - diff / 2,
              initialScale,
            );
          }
          return defaultStageViewHeight * initialScale;
        });
        return 0;
      });
    } else {
      centerView(initialScale);
    }
  };

  return (
    <div className="pgv-stages-graph__controls pgw-zoom-controls">
      <Tooltip content={"Zoom in"}>
        <button
          className={"jenkins-button jenkins-button--tertiary"}
          onClick={() => zoomIn()}
          disabled={scale >= MAX_SCALE}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="32"
              d="M256 112v288M400 256H112"
            />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content={"Zoom out"}>
        <button
          className={"jenkins-button jenkins-button--tertiary"}
          onClick={() => zoomOut()}
          disabled={scale <= minScale}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="32"
              d="M400 256H112"
            />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content={"Reset"}>
        <button
          className={"jenkins-button jenkins-button--tertiary"}
          onClick={reset}
          disabled={scale === initialScale && isCentered}
        >
          <svg className="ionicon" viewBox="0 0 512 512">
            <path
              d="M320 146s24.36-12-64-12a160 160 0 10160 160"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeMiterlimit="10"
              strokeWidth="32"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="32"
              d="M256 58l80 80-80 80"
            />
          </svg>
        </button>
      </Tooltip>
      {hasCollapsibleStages && (
        <Tooltip
          content={
            collapsedStageIds.size > 0
              ? messages.format(LocalizedMessageKey.expandAllStages)
              : messages.format(LocalizedMessageKey.collapseAllStages)
          }
        >
          <button
            className={"jenkins-button jenkins-button--tertiary"}
            onClick={collapsedStageIds.size > 0 ? onExpandAll : onCollapseAll}
          >
            {collapsedStageIds.size > 0 ? EXPAND : COLLAPSE}
          </button>
        </Tooltip>
      )}
    </div>
  );
}
