import { describe, expect } from "vitest";

import { DEFAULT_LOCALE } from "../../../common/i18n/index.ts";
import { defaultMessages } from "../../../common/i18n/messages.ts";
import { nestedGraphLayout } from "./NestedPipelineGraphLayout.ts";
import {
  CompositeConnection,
  defaultLayout,
  StageInfo,
} from "./PipelineGraphModel.tsx";

describe("NestedPipelineGraphLayout", () => {
  describe("nestedGraphLayout", () => {
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
      const graph = nestedGraphLayout(
        stages,
        defaultLayout,
        false,
        defaultMessages(DEFAULT_LOCALE),
        false,
        false,
      );
      expect(simpleConnections(graph.connections)).toEqual([
        {
          sourceNodes: "start-node",
          destinationNodes: "n_8,n_9,n_10",
          hasBranchLabels: true,
        },
        { sourceNodes: "n_8", destinationNodes: "n_12" },
        { sourceNodes: "n_12", destinationNodes: "n_34,n_35" },
        { sourceNodes: "n_34,n_35", destinationNodes: "stage_end_n_8" },
        { sourceNodes: "n_9", destinationNodes: "n_14" },
        { sourceNodes: "n_14", destinationNodes: "n_28" },
        { sourceNodes: "n_28", destinationNodes: "n_48,n_49" },
        { sourceNodes: "n_48,n_49", destinationNodes: "n_71" },
        { sourceNodes: "n_10", destinationNodes: "n_16" },
        { sourceNodes: "n_16", destinationNodes: "n_31" },
        { sourceNodes: "n_31", destinationNodes: "n_54" },
        { sourceNodes: "n_54", destinationNodes: "n_68" },
        { sourceNodes: "n_68", destinationNodes: "n_80" },
        { sourceNodes: "n_80", destinationNodes: "n_85" },
        { sourceNodes: "n_85", destinationNodes: "n_90" },
        {
          sourceNodes: "stage_end_n_8,n_71,n_90",
          destinationNodes: "end-node",
        },
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
      const graph = nestedGraphLayout(
        stages,
        defaultLayout,
        false,
        defaultMessages(DEFAULT_LOCALE),
        false,
        false,
      );
      expect(simpleConnections(graph.connections)).toEqual([
        {
          sourceNodes: "start-node",
          destinationNodes: "n_7,n_8",
          hasBranchLabels: true,
        },
        { sourceNodes: "n_7", destinationNodes: "n_16,n_17" },
        { sourceNodes: "n_16,n_17", destinationNodes: "stage_end_n_7" },
        {
          sourceNodes: "n_8",
          destinationNodes: "n_21,n_22",
          hasBranchLabels: true,
        },
        { sourceNodes: "n_21", destinationNodes: "n_28" },
        { sourceNodes: "n_28", destinationNodes: "n_58,n_59" },
        { sourceNodes: "n_58,n_59", destinationNodes: "stage_end_n_21" },
        {
          sourceNodes: "stage_end_n_21,n_22",
          destinationNodes: "stage_end_n_8",
        },
        {
          sourceNodes: "stage_end_n_7,stage_end_n_8",
          destinationNodes: "end-node",
        },
      ]);
    });
  });
});
