import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

assert.match(
  app,
  /a\.map\(\(x, index\) => "<li>" \+ f\(x, index\) \+ "<\/li>"\)/,
);
assert.match(
  app,
  /\(pause, index\) =>[\s\S]*\(index \+ 1\)[\s\S]*esc\(pause\.label\)/,
);
