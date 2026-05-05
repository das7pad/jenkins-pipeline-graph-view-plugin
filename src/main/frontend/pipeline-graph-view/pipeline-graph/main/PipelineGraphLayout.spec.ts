import { describe, expect } from "vitest";

import { DEFAULT_LOCALE } from "../../../common/i18n/index.ts";
import { defaultMessages } from "../../../common/i18n/messages.ts";
import {
  createNodeColumns,
  layoutGraph,
  newLayoutGraph,
} from "./PipelineGraphLayout.ts";
import {
  CompositeConnection,
  defaultLayout,
  LayoutInfo,
  Result,
  StageInfo,
  StageType,
} from "./PipelineGraphModel.tsx";

describe("PipelineGraphLayout", () => {
  const baseStage: StageInfo = {
    name: "",
    title: "",
    state: Result.success,
    id: 0,
    type: "STAGE",
    children: [],
    pauseDurationMillis: 0,
    startTimeMillis: 0,
    totalDurationMillis: 0,
    agent: "built-in",
    url: "/?selected-node=0",
  };

  const makeStage = (
    id: number,
    name: string,
    children: Array<StageInfo> = [],
  ): StageInfo => {
    return { ...baseStage, id, name, children };
  };

  const makeParallel = (
    id: number,
    name: string,
    children: Array<StageInfo> = [],
  ): StageInfo => {
    return {
      ...baseStage,
      id,
      name,
      children,
      type: "PARALLEL" as StageType,
    };
  };

  describe("createNodeColumns", () => {
    const makeNode = (
      id: number,
      name: string,
      seqContainerName: string | undefined = undefined,
    ) => {
      return {
        id,
        name,
        stage: { id, name },
        ...(seqContainerName !== undefined ? { seqContainerName } : {}),
      };
    };

    it("returns no columns if no stages", () => {
      const columns = createNodeColumns([]);
      expect(columns).toEqual([]);
    });

    it("returns proper columns (unstableSmokes)", () => {
      const columns = createNodeColumns([
        makeStage(4, "unstable-one"),
        makeStage(15, "success"),
        makeStage(20, "unstable-two"),
        makeStage(26, "failure"),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: false,
          topStage: { name: "unstable-one", id: 4 },
          rows: [[makeNode(4, "unstable-one")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "success", id: 15 },
          rows: [[makeNode(15, "success")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "unstable-two", id: 20 },
          rows: [[makeNode(20, "unstable-two")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "failure", id: 26 },
          rows: [[makeNode(26, "failure")]],
        },
      ]);
    });

    it("returns proper columns (complexSmokes)", () => {
      const columns = createNodeColumns([
        makeStage(6, "Non-Parallel Stage"),
        makeStage(11, "Parallel Stage", [
          makeParallel(15, "Branch A"),
          makeParallel(16, "Branch B"),
          makeParallel(17, "Branch C", [
            makeStage(25, "Nested 1"),
            makeStage(38, "Nested 2"),
          ]),
        ]),
        makeStage(49, "Skipped stage"),
        makeStage(53, "Parallel Stage 2", [
          makeParallel(57, "Branch A"),
          makeParallel(58, "Branch B"),
          makeParallel(59, "Branch C", [
            makeStage(67, "Nested 1"),
            makeStage(80, "Nested 2"),
          ]),
        ]),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: false,
          topStage: { name: "Non-Parallel Stage", id: 6 },
          rows: [[makeNode(6, "Non-Parallel Stage")]],
        },
        {
          hasBranchLabels: true,
          topStage: { name: "Parallel Stage", id: 11 },
          rows: [
            [makeNode(15, "Branch A")],
            [makeNode(16, "Branch B")],
            [
              makeNode(25, "Nested 1", "Branch C"),
              makeNode(38, "Nested 2", "Branch C"),
            ],
          ],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Skipped stage", id: 49 },
          rows: [[makeNode(49, "Skipped stage")]],
        },
        {
          hasBranchLabels: true,
          topStage: { name: "Parallel Stage 2", id: 53 },
          rows: [
            [makeNode(57, "Branch A")],
            [makeNode(58, "Branch B")],
            [
              makeNode(67, "Nested 1", "Branch C"),
              makeNode(80, "Nested 2", "Branch C"),
            ],
          ],
        },
      ]);
    });

    it("returns proper columns (GH#63.1)", () => {
      const columns = createNodeColumns([
        makeStage(6, "Test", [
          makeParallel(9, "Matrix - PLATFORM = '1'", [
            makeStage(20, "Stage 1"),
            makeStage(30, "Stage 2"),
            makeStage(40, "Stage 3"),
          ]),
          makeParallel(10, "Matrix - PLATFORM = '2'", [
            makeStage(22, "Stage 1"),
            makeStage(32, "Stage 2"),
            makeStage(42, "Stage 3"),
          ]),
        ]),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: true,
          topStage: { name: "Test", id: 6 },
          rows: [
            [
              makeNode(20, "Stage 1", "Matrix - PLATFORM = '1'"),
              makeNode(30, "Stage 2", "Matrix - PLATFORM = '1'"),
              makeNode(40, "Stage 3", "Matrix - PLATFORM = '1'"),
            ],
            [
              makeNode(22, "Stage 1", "Matrix - PLATFORM = '2'"),
              makeNode(32, "Stage 2", "Matrix - PLATFORM = '2'"),
              makeNode(42, "Stage 3", "Matrix - PLATFORM = '2'"),
            ],
          ],
        },
      ]);
    });

    it("returns proper columns (GH#63.2)", () => {
      const columns = createNodeColumns([
        makeStage(6, "build and run", [
          makeParallel(12, "darwin-amd64", [
            makeStage(24, "build"),
            makeStage(39, "run"),
            makeStage(55, "unit test"),
          ]),
          makeParallel(11, "linux-amd64", [
            makeStage(22, "build"),
            makeStage(36, "run"),
            makeStage(53, "unit test"),
            makeStage(64, "load test"),
            makeStage(71, "deploy to storage"),
          ]),
          makeParallel(10, "linux-armv6", [
            makeStage(20, "build"),
            makeStage(34, "run"),
          ]),
        ]),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: true,
          topStage: { name: "build and run", id: 6 },
          rows: [
            [
              makeNode(24, "build", "darwin-amd64"),
              makeNode(39, "run", "darwin-amd64"),
              makeNode(55, "unit test", "darwin-amd64"),
            ],
            [
              makeNode(22, "build", "linux-amd64"),
              makeNode(36, "run", "linux-amd64"),
              makeNode(53, "unit test", "linux-amd64"),
              makeNode(64, "load test", "linux-amd64"),
              makeNode(71, "deploy to storage", "linux-amd64"),
            ],
            [
              makeNode(20, "build", "linux-armv6"),
              makeNode(34, "run", "linux-armv6"),
            ],
          ],
        },
      ]);
    });

    it("returns proper columns (GH#50)", () => {
      const columns = createNodeColumns([
        makeStage(3, "Parallel", [
          makeParallel(4, "parallel:0", [
            makeStage(6, "parent:0", [
              makeStage(9, "child:0"),
              makeStage(14, "child:1"),
              makeStage(19, "child:3"),
            ]),
          ]),
        ]),
        makeStage(29, "parent:1"),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: true,
          topStage: { name: "Parallel", id: 3 },
          rows: [
            [
              makeNode(6, "parent:0", "parallel:0"),
              makeNode(9, "child:0", "parent:0"),
              makeNode(14, "child:1", "parent:0"),
              makeNode(19, "child:3", "parent:0"),
            ],
          ],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "parent:1", id: 29 },
          rows: [[makeNode(29, "parent:1")]],
        },
      ]);
    });

    it("returns proper columns (GH#18)", () => {
      const columns = createNodeColumns([
        makeStage(6, "Stage 1"),
        makeStage(11, "Stage 2"),
        makeStage(31, "Stage6, When anyOf", [
          makeStage(12, "Stage 3"),
          makeStage(33, "Parallel", [
            makeParallel(36, "Parallel Stage 1", [
              makeStage(43, "Parallel Stage 1.1"),
              makeStage(61, "Parallel Stage 1.2"),
            ]),
            makeParallel(37, "Parallel Stage 2", [
              makeStage(45, "Parallel Stage 2.1"),
              makeStage(63, "Parallel Stage 2.2"),
            ]),
          ]),
          makeStage(13, "Stage 4", [
            makeStage(14, "Stage 5", [makeStage(15, "Stage 7")]),
          ]),
        ]),
      ]);

      expect(columns).toMatchObject([
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 1", id: 6 },
          rows: [[makeNode(6, "Stage 1")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 2", id: 11 },
          rows: [[makeNode(11, "Stage 2")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage6, When anyOf", id: 31 },
          rows: [[makeNode(31, "Stage6, When anyOf")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 3", id: 12 },
          rows: [[makeNode(12, "Stage 3")]],
        },
        {
          hasBranchLabels: true,
          topStage: { name: "Parallel", id: 33 },
          rows: [
            [
              makeNode(43, "Parallel Stage 1.1", "Parallel Stage 1"),
              makeNode(61, "Parallel Stage 1.2", "Parallel Stage 1"),
            ],
            [
              makeNode(45, "Parallel Stage 2.1", "Parallel Stage 2"),
              makeNode(63, "Parallel Stage 2.2", "Parallel Stage 2"),
            ],
          ],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 4", id: 13 },
          rows: [[makeNode(13, "Stage 4")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 5", id: 14 },
          rows: [[makeNode(14, "Stage 5")]],
        },
        {
          hasBranchLabels: false,
          topStage: { name: "Stage 7", id: 15 },
          rows: [[makeNode(15, "Stage 7")]],
        },
      ]);
    });
  });

  describe("layoutGraph", () => {
    const layout: LayoutInfo = {
      nodeSpacingH: 140,
      parallelSpacingH: 140,
      nodeSpacingV: 70,
      nodeRadius: 12,
      terminalRadius: 10,
      curveRadius: 15,
      connectorStrokeWidth: 2,
      labelOffsetV: 22,
      smallLabelOffsetV: 15,
      ypStart: 55,
    };

    const makeSmallLabel = (stageName: string) => {
      return {
        text: stageName,
      };
    };

    it("should not generate small labels for top stage columns with no children", () => {
      const graph = layoutGraph(
        [
          makeStage(6, "Non-Parallel Stage"),
          makeStage(11, "Parallel Stage", [
            makeParallel(15, "Branch A - P1"),
            makeParallel(16, "Branch B - P1"),
            makeParallel(17, "Branch C - P1", [
              makeStage(25, "Nested 1 - P1"),
              makeStage(38, "Nested 2 - P1"),
            ]),
          ]),
          makeStage(49, "Skipped stage"),
          makeStage(53, "Parallel Stage 2", [
            makeParallel(57, "Branch A - P2"),
            makeParallel(58, "Branch B - P2"),
            makeParallel(59, "Branch C - P2", [
              makeStage(67, "Nested 1 - P2"),
              makeStage(80, "Nested 2 - P2"),
            ]),
          ]),
        ],
        layout,
        false,
        defaultMessages(DEFAULT_LOCALE),
        false,
        false,
      );

      expect(graph.smallLabels).toMatchObject([
        makeSmallLabel("Branch A - P1"),
        makeSmallLabel("Branch B - P1"),
        makeSmallLabel("Nested 1 - P1"),
        makeSmallLabel("Nested 2 - P1"),
        makeSmallLabel("Branch A - P2"),
        makeSmallLabel("Branch B - P2"),
        makeSmallLabel("Nested 1 - P2"),
        makeSmallLabel("Nested 2 - P2"),
      ]);
    });
  });
  describe("newLayoutGraph", () => {
    type LeanCompositeConnection = {
      sourceNodes: string;
      destinationNodes: string;
      skippedNodes?: string;
      hasBranchLabels?: boolean;
    };
    function simpleConnections(connections: CompositeConnection[]) {
      return connections.map((c) => {
        const lean: LeanCompositeConnection = {
          sourceNodes: c.sourceNodes.map((n) => n.key).join(","),
          destinationNodes: c.destinationNodes.map((n) => n.key).join(","),
        };
        if (c.skippedNodes.length > 0) {
          lean.skippedNodes = c.skippedNodes.map((n) => n.key).join(",");
        }
        if (c.hasBranchLabels) {
          lean.hasBranchLabels = true;
        }
        return lean;
      });
    }

    it("smokeTest+", () => {
      /**
        node {
            parallel([
                "A": {
                    stage("Checkout") {
                        echo("Checkout A")
                    }
                    stage("Test") {
                        parallel([
                            "A1" : {
                               echo("Test A1")
                            },
                            "A2" : {
                               echo("Test A2")
                               error 'this step fails'
                            }
                        ])
                    }
                    stage("Coverage") {
                        echo("Coverage")
                    }
                },
                "B": {
                    stage("Checkout") {
                        echo("Checkout B")
                    }
                    stage("Build") {
                        echo("Build B")
                    }
                    parallel([
                        "B1" : {
                           echo("Test B1")
                           sleep time: 1, unit: 'MILLISECONDS'
                           pwd()
                        },
                        "B2" : {
                           echo("Test B2")
                           unstable 'this step is unstable'
                        }
                    ])
                    stage("Archive") {
                        echo("Archive")
                    }
                },
                "C": {
                    for(int i=1; i<=7; i++) {
                        stage("Stage - ${i}") {
                            echo("ok")
                        }
                    }
                }
            ])
        }
       */
      const stages = JSON.parse(
        '[{"id":"5","name":"Parallel","state":"failure","type":"PARALLEL_BLOCK","title":"Parallel","pauseDurationMillis":0,"startTimeMillis":1776716866656,"totalDurationMillis":2638,"children":[{"id":"8","name":"A","state":"failure","type":"PARALLEL","title":"A","pauseDurationMillis":0,"startTimeMillis":1776716866679,"totalDurationMillis":1865,"children":[{"id":"12","name":"Checkout","state":"success","type":"STAGE","title":"Checkout","pauseDurationMillis":0,"startTimeMillis":1776716866804,"totalDurationMillis":105,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=12"},{"id":"26","name":"Test","state":"failure","type":"STAGE","title":"Test","pauseDurationMillis":0,"startTimeMillis":1776716867110,"totalDurationMillis":1087,"children":[{"id":"34","name":"A1","state":"success","type":"PARALLEL","title":"A1","pauseDurationMillis":0,"startTimeMillis":1776716867392,"totalDurationMillis":213,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=34"},{"id":"35","name":"A2","state":"failure","type":"PARALLEL","title":"A2","pauseDurationMillis":0,"startTimeMillis":1776716867404,"totalDurationMillis":339,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=35"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=26"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=8"},{"id":"9","name":"B","state":"unstable","type":"PARALLEL","title":"B","pauseDurationMillis":0,"startTimeMillis":1776716866689,"totalDurationMillis":2221,"children":[{"id":"14","name":"Checkout","state":"success","type":"STAGE","title":"Checkout","pauseDurationMillis":0,"startTimeMillis":1776716866838,"totalDurationMillis":113,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=14"},{"id":"28","name":"Build","state":"success","type":"STAGE","title":"Build","pauseDurationMillis":0,"startTimeMillis":1776716867152,"totalDurationMillis":319,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=28"},{"id":"46","name":"Parallel","state":"unstable","type":"PARALLEL_BLOCK","title":"Parallel","pauseDurationMillis":0,"startTimeMillis":1776716867940,"totalDurationMillis":811,"children":[{"id":"48","name":"B1","state":"success","type":"PARALLEL","title":"B1","pauseDurationMillis":0,"startTimeMillis":1776716867962,"totalDurationMillis":646,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=48"},{"id":"49","name":"B2","state":"unstable","type":"PARALLEL","title":"B2","pauseDurationMillis":0,"startTimeMillis":1776716867970,"totalDurationMillis":458,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=49"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=46"},{"id":"71","name":"Archive","state":"success","type":"STAGE","title":"Archive","pauseDurationMillis":0,"startTimeMillis":1776716868785,"totalDurationMillis":56,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=71"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=9"},{"id":"10","name":"C","state":"success","type":"PARALLEL","title":"C","pauseDurationMillis":0,"startTimeMillis":1776716866696,"totalDurationMillis":2548,"children":[{"id":"16","name":"Stage - 1","state":"success","type":"STAGE","title":"Stage - 1","pauseDurationMillis":0,"startTimeMillis":1776716866876,"totalDurationMillis":126,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=16"},{"id":"31","name":"Stage - 2","state":"success","type":"STAGE","title":"Stage - 2","pauseDurationMillis":0,"startTimeMillis":1776716867331,"totalDurationMillis":233,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=31"},{"id":"54","name":"Stage - 3","state":"success","type":"STAGE","title":"Stage - 3","pauseDurationMillis":0,"startTimeMillis":1776716868283,"totalDurationMillis":207,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=54"},{"id":"68","name":"Stage - 4","state":"success","type":"STAGE","title":"Stage - 4","pauseDurationMillis":0,"startTimeMillis":1776716868690,"totalDurationMillis":119,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=68"},{"id":"80","name":"Stage - 5","state":"success","type":"STAGE","title":"Stage - 5","pauseDurationMillis":0,"startTimeMillis":1776716868933,"totalDurationMillis":38,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=80"},{"id":"85","name":"Stage - 6","state":"success","type":"STAGE","title":"Stage - 6","pauseDurationMillis":0,"startTimeMillis":1776716869043,"totalDurationMillis":46,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=85"},{"id":"90","name":"Stage - 7","state":"success","type":"STAGE","title":"Stage - 7","pauseDurationMillis":0,"startTimeMillis":1776716869156,"totalDurationMillis":42,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=90"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=10"}],"isSequential":false,"synthetic":false,"placeholder":false,"agent":"built-in","url":"/job/pipelines-in-repo/job/smoketest/5/stages/?selected-node=5"}]',
      ) as StageInfo[];
      const graph = newLayoutGraph(
        stages,
        defaultLayout,
        false,
        defaultMessages(DEFAULT_LOCALE),
        false,
        false,
      );
      console.log(simpleConnections(graph.connections));
      expect(simpleConnections(graph.connections)).toEqual([
        { sourceNodes: "start-node", destinationNodes: "n_8,n_9,n_10" },
        { sourceNodes: "n_8", destinationNodes: "n_12" },
        { sourceNodes: "n_12", destinationNodes: "n_26" },
        { sourceNodes: "n_26", destinationNodes: "n_34,n_35" },
        { sourceNodes: "n_9", destinationNodes: "n_14" },
        { sourceNodes: "n_14", destinationNodes: "n_28" },
        { sourceNodes: "n_28", destinationNodes: "n_46" },
        { sourceNodes: "n_46", destinationNodes: "n_48,n_49" },
        { sourceNodes: "n_48,n_49", destinationNodes: "n_71" },
        { sourceNodes: "n_10", destinationNodes: "n_16" },
        { sourceNodes: "n_16", destinationNodes: "n_31" },
        { sourceNodes: "n_31", destinationNodes: "n_54" },
        { sourceNodes: "n_54", destinationNodes: "n_68" },
        { sourceNodes: "n_68", destinationNodes: "n_80" },
        { sourceNodes: "n_80", destinationNodes: "n_85" },
        { sourceNodes: "n_85", destinationNodes: "n_90" },
        { sourceNodes: "n_34,n_35,n_71,n_90", destinationNodes: "end-node" },
      ]);
    });
    it("1155+", () => {
      /**
        stage('Top level') {
            // outer parallel: two branches
            parallel(
                // First top-level branch
                BranchA: {
                    stage('Branch A') {
                        echo "Starting Branch A"

                        // inner parallel inside Branch A
                        parallel(
                            'A-1': {
                                stage('A-1') {
                                    echo "Doing work in A-1"
                                    sleep 2
                                }
                            },
                            'A-2': {
                                stage('A-2') {
                                    echo "Doing work in A-2"
                                    sleep 2
                                }
                            }
                        )

                        echo "Finished Branch A"
                    }
                },

                // Second top-level branch
                BranchB: {
                    stage('Branch B') {
                        echo "Starting Branch B"

                        // inner parallel inside Branch B
                        parallel(
                            'B-1': {
                                stage('B-1-1') {
                                    echo "Doing work in B-1-1"
                                    sleep 2
                                }
                                stage('B-1-2') {
                                    echo "Starting Branch B-1-2"
                                    parallel(
                                        'B-1-2-1': {
                                            stage('B-1-2-1') {
                                                echo "Doing work in B-1-2-1"
                                            }
                                        },
                                        'B-1-2-2': {
                                            stage('B-1-2-2') {
                                                echo "Doing work in B-1-2-2"
                                            }
                                        }
                                    )
                                    echo "Finishing Branch B-1.1"
                                }
                            },
                            'B-2': {
                                stage('B-2') {
                                    echo "Doing work in B-2"
                                    sleep 2
                                }
                            }
                        )

                        echo "Finished Branch B"
                    }
                }
            )
        }
       */
      const stages = JSON.parse(
        '[{"id":"4","name":"Top level","state":"success","type":"STAGE","title":"Top level","pauseDurationMillis":0,"startTimeMillis":1776545741693,"totalDurationMillis":3105,"children":[{"id":"7","name":"BranchA","state":"success","type":"PARALLEL","title":"BranchA","pauseDurationMillis":0,"startTimeMillis":1776545741753,"totalDurationMillis":2577,"children":[{"id":"10","name":"Branch A","state":"success","type":"STAGE","title":"Branch A","pauseDurationMillis":0,"startTimeMillis":1776545741804,"totalDurationMillis":2479,"children":[{"id":"16","name":"A-1","state":"success","type":"PARALLEL","title":"A-1","pauseDurationMillis":0,"startTimeMillis":1776545741877,"totalDurationMillis":2298,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=16"},{"id":"17","name":"A-2","state":"success","type":"PARALLEL","title":"A-2","pauseDurationMillis":0,"startTimeMillis":1776545741883,"totalDurationMillis":2346,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=17"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=10"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=7"},{"id":"8","name":"BranchB","state":"success","type":"PARALLEL","title":"BranchB","pauseDurationMillis":0,"startTimeMillis":1776545741761,"totalDurationMillis":3001,"children":[{"id":"12","name":"Branch B","state":"success","type":"STAGE","title":"Branch B","pauseDurationMillis":0,"startTimeMillis":1776545741826,"totalDurationMillis":2909,"children":[{"id":"21","name":"B-1","state":"success","type":"PARALLEL","title":"B-1","pauseDurationMillis":0,"startTimeMillis":1776545741924,"totalDurationMillis":2758,"children":[{"id":"28","name":"B-1-1","state":"success","type":"STAGE","title":"B-1-1","pauseDurationMillis":0,"startTimeMillis":1776545742013,"totalDurationMillis":2274,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=28"},{"id":"53","name":"B-1-2","state":"success","type":"STAGE","title":"B-1-2","pauseDurationMillis":0,"startTimeMillis":1776545744350,"totalDurationMillis":292,"children":[{"id":"58","name":"B-1-1-1","state":"success","type":"PARALLEL","title":"B-1-1-1","pauseDurationMillis":0,"startTimeMillis":1776545744399,"totalDurationMillis":178,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=58"},{"id":"59","name":"B-1-1-2","state":"success","type":"PARALLEL","title":"B-1-1-2","pauseDurationMillis":0,"startTimeMillis":1776545744404,"totalDurationMillis":179,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=59"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=53"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=21"},{"id":"22","name":"B-2","state":"success","type":"PARALLEL","title":"B-2","pauseDurationMillis":0,"startTimeMillis":1776545741930,"totalDurationMillis":2502,"children":[],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=22"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=12"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=8"}],"isSequential":false,"synthetic":false,"placeholder":false,"url":"/job/issues/job/1155/4/stages/?selected-node=4"}]',
      ) as StageInfo[];
      const graph = newLayoutGraph(
        stages,
        defaultLayout,
        false,
        defaultMessages(DEFAULT_LOCALE),
        false,
        false,
      );
      console.log(simpleConnections(graph.connections));
      expect(simpleConnections(graph.connections)).toEqual([
        { sourceNodes: "start-node", destinationNodes: "n_4" },
        { sourceNodes: "n_4", destinationNodes: "n_7,n_8" },
        { sourceNodes: "n_7", destinationNodes: "n_10" },
        { sourceNodes: "n_10", destinationNodes: "n_16,n_17" },
        { sourceNodes: "n_8", destinationNodes: "n_12" },
        { sourceNodes: "n_12", destinationNodes: "n_21,n_22" },
        { sourceNodes: "n_21", destinationNodes: "n_28" },
        { sourceNodes: "n_28", destinationNodes: "n_53" },
        { sourceNodes: "n_53", destinationNodes: "n_58,n_59" },
        {
          sourceNodes: "n_16,n_17,n_58,n_59,n_22",
          destinationNodes: "end-node",
        },
      ]);
    });
  });
});
