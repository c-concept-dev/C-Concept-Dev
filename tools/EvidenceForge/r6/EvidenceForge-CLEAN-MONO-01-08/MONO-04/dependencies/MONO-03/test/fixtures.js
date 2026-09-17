"use strict";

const path = require("path");
const { createMono03, createInMemoryBackend } = require("../index.js");

const GRAPH_JSON_PATH = path.join(__dirname, "..", "dependencies", "MONO-02", "graph", "mono-02-orchestration-graph-v1.json");

function loadMono02NodeDefs() {
  const graph = require(GRAPH_JSON_PATH);
  return graph.nodes.map((n) => ({ nodeId: n.nodeId, resumePolicy: n.resumePolicy, retryPolicy: n.retryPolicy }));
}

function orderedNodeIds() {
  return loadMono02NodeDefs().map((n) => n.nodeId);
}

function freshMono03() {
  const backend = createInMemoryBackend();
  return { backend, mono03: createMono03({ persistenceBackend: backend }) };
}

function mono03On(backend) {
  return createMono03({ persistenceBackend: backend });
}

async function createSampleRun(mono03, runId, missionId) {
  return mono03.runStore.createRun({
    runId,
    missionId,
    graphVersion: "MONO-02-v1",
    baselineVersion: "MONO-00-v1",
    integrationVersion: "MONO-01-v1",
    nodeDefs: loadMono02NodeDefs(),
  });
}

module.exports = {
  createInMemoryBackend,
  createMono03,
  loadMono02NodeDefs,
  orderedNodeIds,
  freshMono03,
  mono03On,
  createSampleRun,
};
