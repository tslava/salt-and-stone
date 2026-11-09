import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
let n = 0;
for (const dir of ["src", "scripts", "tests"])
  for (const file of await readdir(dir))
    if (/\.(js|mjs)$/.test(file)) {
      execFileSync(process.execPath, ["--check", `${dir}/${file}`]);
      n++;
    }
console.log(`Syntax checked ${n} modules.`);
