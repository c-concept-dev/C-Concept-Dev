import { mkdirSync, writeFileSync } from "node:fs";
import { feuilleCss } from "../src/index.js";

mkdirSync("dist", { recursive: true });
writeFileSync("dist/lienotheque.css", feuilleCss());
console.log("dist/lienotheque.css généré");
