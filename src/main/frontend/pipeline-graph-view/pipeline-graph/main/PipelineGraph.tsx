import {
  CSSProperties,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Context as TransformContext } from "react-zoom-pan-pinch";

import { I18NContext } from "../../../common/i18n/index.ts";
import { useUserPreferences } from "../../../common/user/user-preferences-provider.tsx";
import { nestedGraphLayout } from "./NestedPipelineGraphLayout.ts";
import {
  DEFAULT_MAX_COLUMNS_WHEN_COLLAPSED,
  layoutGraph,
} from "./PipelineGraphLayout";
import {
  debugPipelineGraph,
  defaultLayout,
  LayoutInfo,
  nestedLayout,
  StageInfo,
} from "./PipelineGraphModel.tsx";
import { GraphConnections } from "./support/connections.tsx";
import { DebugOutline } from "./support/DebugOutline.tsx";
import {
  BigLabel,
  SequentialContainerLabel,
  SmallLabel,
  TimingsLabel,
} from "./support/labels.tsx";
import { Node, SelectionHighlight } from "./support/nodes.tsx";

interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

const VIEWPORT_MARGIN = 300;

const MIN_COLUMNS_WHEN_COLLAPSED = 5;

const DEFAULT_SCROLLBAR_WIDTH = 15;

export function PipelineGraph({
  stages = [],
  layout,
  selectedStage,
  collapsed,
  onStageSelect,
  collapsedStageIds,
  onToggleCollapse,
  setMinScale,
  setInitialScale,
  setDefaultTransform,
  setAutoStageViewHeight,
  setDefaultStageViewHeight,
  centerGraph,
  setCenterGraph,
  currentRunPath,
}: Props) {
  const fullLayout = useMemo(() => {
    return {
      ...defaultLayout,
      ...layout,
    };
  }, [layout]);
  const { showNames, showDurations } = useUserPreferences();

  const messages = useContext(I18NContext);

  const containerRef = useRef<HTMLDivElement>(null);
  const [maxColumnsWhenCollapsed, setMaxColumnsWhenCollapsed] =
    useState<number>(DEFAULT_MAX_COLUMNS_WHEN_COLLAPSED);

  useLayoutEffect(() => {
    if (!collapsed) return;
    const node = containerRef.current;
    if (!node) return;

    const apply = (width: number) => {
      if (width <= 0) return;
      const reservedSpace =
        // before start
        fullLayout.graphSpacingLeft +
        fullLayout.nodeSpacingH / 2 +
        fullLayout.nodeSpacingH * 0.7 + // start node with reduced spacing
        -fullLayout.nodeSpacingH * 0.3 + // reduced spacing to end node
        // after end
        fullLayout.nodeSpacingH / 2 +
        fullLayout.graphSpacingRight;
      const next = Math.max(
        MIN_COLUMNS_WHEN_COLLAPSED,
        Math.floor((width - reservedSpace) / fullLayout.nodeSpacingH),
      );
      setMaxColumnsWhenCollapsed((prev) => (prev === next ? prev : next));
    };

    apply(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        apply(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    collapsed,
    fullLayout.graphSpacingLeft,
    fullLayout.graphSpacingRight,
    fullLayout.nodeSpacingH,
  ]);

  const {
    nodes,
    allNodes,
    connections,
    bigLabels,
    timings,
    smallLabels,
    branchLabels,
    measuredWidth,
    measuredHeight,
  } = useMemo(() => {
    if (nestedLayout()) {
      return nestedGraphLayout(
        currentRunPath,
        stages,
        fullLayout,
        collapsed ?? false,
        messages,
        showNames || !collapsed,
        showDurations,
        maxColumnsWhenCollapsed,
      );
    }
    return layoutGraph(
      currentRunPath,
      stages,
      fullLayout,
      collapsed ?? false,
      messages,
      showNames,
      showDurations,
      maxColumnsWhenCollapsed,
    );
  }, [
    currentRunPath,
    stages,
    fullLayout,
    collapsed,
    messages,
    showNames,
    showDurations,
    maxColumnsWhenCollapsed,
  ]);

  const stageIsSelected = useCallback(
    (stage?: StageInfo): boolean => {
      return (selectedStage && stage && selectedStage.id === stage.id) || false;
    },
    [selectedStage],
  );

  const scrollBarState = useRef({
    width: DEFAULT_SCROLLBAR_WIDTH,
    flipped: false,
  });
  const transform = useContext(TransformContext);
  const [transformWidth, setTransformWidth] = useState(() => {
    if (!transform?.wrapperComponent) return 0;
    return (
      // ResizeObserverEntry.contentRect accounts for padding, getBoundingClientRect does not.
      transform.wrapperComponent.getBoundingClientRect().width -
      (fullLayout.graphSpacingLeft + fullLayout.graphSpacingRight)
    );
  });
  useLayoutEffect(() => {
    if (!transform?.wrapperComponent) return;
    const observer = new ResizeObserver((entries) => {
      const lastScrollbarState = scrollBarState.current;
      const scrollbarWidth = window.innerWidth - document.body.clientWidth;
      const flipped = lastScrollbarState.width !== scrollbarWidth;
      scrollBarState.current = { width: scrollbarWidth, flipped };
      for (const entry of entries) {
        let { width: transformWidth } = entry.contentRect;
        if (flipped && lastScrollbarState.flipped) {
          // Flipped because of scaling to fit within body w/ and w/o scrollbar.
          // 1. Zoom-in -> page overflows and triggers scrollbar
          // 2. Added scrollbar -> smaller transformWidth -> zoom-out
          // 3. Zoom-out -> page no longer overflows and scrollbar disappears
          // 4. Go to 1.
          // Counter the loop by faking the width without the scrollbar spacing
          // and thereby zooming-out a bit more than needed -> no scrollbar.
          transformWidth -= lastScrollbarState.width;
        }
        setTransformWidth(transformWidth);
      }
    });
    observer.observe(transform.wrapperComponent);
    return () => observer.disconnect();
  }, [transform?.wrapperComponent]);

  useLayoutEffect(() => {
    if (!setMinScale || !setInitialScale || !transform) return;
    if (transformWidth <= 0 || measuredWidth <= 0 || measuredHeight <= 0) {
      return;
    }

    const initialScale = Math.min(1, transformWidth / measuredWidth);
    const minScale = initialScale * 0.75;
    const autoScale = Math.max(initialScale, 0.5);
    const centerOffsetX = Math.max(
      0,
      (transformWidth - measuredWidth * autoScale) / 2,
    );
    // The stage height is adjusted to "fit the graph". The graph always sits at the "top".
    const centerOffsetY = 0;
    setMinScale(minScale);
    setInitialScale(initialScale);
    setDefaultTransform?.({
      scale: autoScale,
      positionX: centerOffsetX,
      positionY: centerOffsetY,
    });
    // The graphSpacingXXX is applied outside the transform wrapper.
    // They only affect the stage view height and _not_ the graph position/scale inside.
    const verticalExtra =
      fullLayout.graphSpacingTop + fullLayout.graphSpacingBottom;
    setDefaultStageViewHeight?.(measuredHeight + verticalExtra);
    if (centerGraph) {
      // Don't scale too small by default.
      const autoHeight = Math.max(
        Math.min(measuredHeight, fullLayout.nodeSpacingH),
        measuredHeight * autoScale,
      );
      setAutoStageViewHeight?.(autoHeight + verticalExtra);
      if (
        transform.state.scale !== autoScale ||
        transform.state.positionX !== centerOffsetX ||
        transform.state.positionY !== centerOffsetY
      ) {
        transform.setState(autoScale, centerOffsetX, centerOffsetY);
      }
      return transform.onChange(() => {
        setCenterGraph?.(false);
        setAutoStageViewHeight?.(0);
      });
    }
  }, [
    transform,
    transformWidth,
    centerGraph,
    setCenterGraph,
    fullLayout.nodeSpacingH,
    fullLayout.graphSpacingTop,
    fullLayout.graphSpacingBottom,
    measuredWidth,
    measuredHeight,
    setMinScale,
    setInitialScale,
    setDefaultTransform,
    setAutoStageViewHeight,
    setDefaultStageViewHeight,
  ]);

  // When inside a TransformWrapper, only mount the nodes/labels intersecting
  // the visible region. Mounting thousands of absolute-positioned divs forces
  // a synchronous layout flush that blocks the main thread for seconds.
  const virtualize = transform != null;
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const cachedViewport = useRef<Viewport | null>(null);

  useLayoutEffect(() => {
    if (!transform?.wrapperComponent) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const wrapper = transform.wrapperComponent;
      if (!wrapper) return;
      const { positionX, positionY, scale } = transform.state;
      const next: Viewport = {
        x: -positionX / scale,
        y: -positionY / scale,
        w: wrapper.offsetWidth / scale,
        h: wrapper.offsetHeight / scale,
      };
      const prev = cachedViewport.current;
      if (
        prev &&
        Math.abs(prev.x - next.x) < 50 &&
        Math.abs(prev.y - next.y) < 50 &&
        Math.abs(prev.w - next.w) < 50 &&
        Math.abs(prev.h - next.h) < 50
      ) {
        return;
      }
      cachedViewport.current = next;
      setViewport(next);
    };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    };
    schedule();
    const unsubChange = transform.onChange(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(transform.wrapperComponent);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubChange();
      observer.disconnect();
    };
  }, [transform, transform?.wrapperComponent]);

  const ready = !!(!virtualize || (viewport && transformWidth > 0));
  const itemsInViewport = useCallback(
    <T extends { x: number; y: number }>(items: T[]): T[] => {
      if (!virtualize) return items;
      if (!ready || !viewport) return []; // No partial rendering until ready.
      return items.filter(({ x, y }) => {
        return (
          x >= viewport.x - VIEWPORT_MARGIN &&
          x <= viewport.x + viewport.w + VIEWPORT_MARGIN &&
          y >= viewport.y - VIEWPORT_MARGIN &&
          y <= viewport.y + viewport.h + VIEWPORT_MARGIN
        );
      });
    },
    [viewport, virtualize, ready],
  );

  const selectedStageId = selectedStage?.id;
  const visibleNodes = useMemo(() => {
    if (!virtualize) return nodes;
    if (!ready) return []; // No partial rendering until ready.
    const filtered = itemsInViewport(nodes);
    if (selectedStageId == null) return filtered;
    if (
      filtered.some((n) => !n.isPlaceholder && n.stage?.id === selectedStageId)
    ) {
      return filtered;
    }
    const sel = nodes.find(
      (n) => !n.isPlaceholder && n.stage?.id === selectedStageId,
    );
    return sel ? [...filtered, sel] : filtered;
  }, [nodes, itemsInViewport, virtualize, selectedStageId, ready]);

  const visibleBigLabels = useMemo(
    () => itemsInViewport(bigLabels),
    [bigLabels, itemsInViewport],
  );

  const visibleSmallLabels = useMemo(
    () => itemsInViewport(smallLabels),
    [smallLabels, itemsInViewport],
  );

  const visibleBranchLabels = useMemo(
    () => itemsInViewport(branchLabels),
    [branchLabels, itemsInViewport],
  );

  const visibleTimings = useMemo(
    () => itemsInViewport(timings),
    [timings, itemsInViewport],
  );

  const outerDivStyle: CSSProperties = {
    position: "relative",
    overflow: "visible",
  };
  if (debugPipelineGraph()) {
    outerDivStyle.border = "1px dashed red";
  }

  return (
    <div ref={containerRef} className="PWGx-PipelineGraph-container">
      <div style={outerDivStyle} className="PWGx-PipelineGraph">
        {ready && (
          <svg width={measuredWidth} height={measuredHeight}>
            <GraphConnections connections={connections} layout={fullLayout} />

            <SelectionHighlight
              layout={fullLayout}
              nodes={nodes}
              isStageSelected={stageIsSelected}
            />

            {debugPipelineGraph() &&
              allNodes.map((node) => (
                <DebugOutline node={node} layout={fullLayout} key={node.id} />
              ))}
          </svg>
        )}

        {visibleNodes.map((node) => (
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

        {visibleBigLabels.map((label) => (
          <BigLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            measuredHeight={measuredHeight}
            isSelected={selectedStage?.id === label.stage?.id}
            isCollapsed={
              label.stage ? collapsedStageIds.has(label.stage.id) : false
            }
            onToggleCollapse={onToggleCollapse}
          />
        ))}

        {visibleTimings.map((label) => (
          <TimingsLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            measuredHeight={measuredHeight}
            isSelected={selectedStage?.id === label.stage?.id}
          />
        ))}

        {visibleSmallLabels.map((label) => (
          <SmallLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            isSelected={selectedStage?.id === label.stage?.id}
            isCollapsed={
              label.stage ? collapsedStageIds.has(label.stage.id) : false
            }
            onToggleCollapse={onToggleCollapse}
          />
        ))}

        {visibleBranchLabels.map((label) => (
          <SequentialContainerLabel
            key={label.key}
            details={label}
            layout={fullLayout}
            isCollapsed={
              label.stage ? collapsedStageIds.has(label.stage.id) : false
            }
            onToggleCollapse={onToggleCollapse}
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
  collapsedStageIds: Set<number>;
  onToggleCollapse: (stageId: number) => void;
  setMinScale?: (value: number) => void;
  setInitialScale?: (value: number) => void;
  setDefaultTransform?: (value: {
    scale: number;
    positionX: number;
    positionY: number;
  }) => void;
  setAutoStageViewHeight?: Dispatch<SetStateAction<number>>;
  setDefaultStageViewHeight?: Dispatch<SetStateAction<number>>;
  centerGraph?: boolean;
  setCenterGraph?: Dispatch<SetStateAction<boolean>>;
  currentRunPath: string;
}
