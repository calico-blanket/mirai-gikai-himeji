import { readFileSync } from "node:fs";
import { parseCouncilData } from "../lib/data/schema.ts";

const path = process.argv[2];
if (!path) throw new Error("JSONファイルのパスが必要です");
const data = parseCouncilData(JSON.parse(readFileSync(path, "utf8")));
console.log(`検証成功: ${data.counts.items}件、出典${data.counts.sources}件`);
