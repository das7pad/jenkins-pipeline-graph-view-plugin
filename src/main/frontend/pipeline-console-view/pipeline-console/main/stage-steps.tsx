import "./stage-steps.scss";

import { StepInfo, StepLogBufferInfo } from "../../../common/RestClient.tsx";
import ConsoleLogCard from "./ConsoleLogCard.tsx";
import { StageInfo } from "./PipelineConsoleModel.tsx";

export default function StageSteps({
  stage,
  stepBuffers,
  steps,
  onStepToggle,
  expandedSteps,
  onMoreConsoleClick,
  fetchExceptionText,
}: StageStepsProps) {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div
      className={"pgv-stage-steps"}
      key={`stage-steps-container-${stage ? stage.id : "unk"}`}
    >
      {steps.map((stepItemData) => {
        return (
          <ConsoleLogCard
            step={stepItemData}
            stepBuffers={stepBuffers}
            onStepToggle={onStepToggle}
            isExpanded={expandedSteps.includes(stepItemData.id)}
            onMoreConsoleClick={onMoreConsoleClick}
            fetchExceptionText={fetchExceptionText}
            key={`step-console-card-${stepItemData.id}`}
          />
        );
      })}
    </div>
  );
}

interface StageStepsProps {
  stage: StageInfo | null;
  steps: Array<StepInfo>;
  stepBuffers: Map<string, StepLogBufferInfo>;
  expandedSteps: string[];
  onStepToggle: (nodeId: string) => void;
  onMoreConsoleClick: (
    nodeId: string,
    startByte: number,
  ) => Promise<StepLogBufferInfo>;
  fetchExceptionText: (nodeId: string) => Promise<StepLogBufferInfo>;
}
