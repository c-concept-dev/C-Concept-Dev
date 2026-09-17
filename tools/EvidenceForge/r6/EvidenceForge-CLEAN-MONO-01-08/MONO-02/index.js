"use strict";

const path = require("path");
const { createOrchestrationEngine } = require("./lib/orchestration-engine.js");

const DEFAULT_GRAPH_PATH = path.join(__dirname, "graph", "mono-02-orchestration-graph-v1.json");

module.exports = { createOrchestrationEngine, DEFAULT_GRAPH_PATH };
