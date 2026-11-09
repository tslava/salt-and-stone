import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { networkInterfaces } from "node:os";
const root = resolve(process.argv.includes("--dist") ? "dist" : ".");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (
      !(
        path === resolve(root, "index.html") ||
        path.startsWith(resolve(root, "src") + sep)
      ) ||
      !path.startsWith(root + sep) ||
      /(^|\/)[.]/.test(url.pathname) ||
      !["/index.html", "/src/"].some(
        (p) => url.pathname === "/" || url.pathname.startsWith(p),
      )
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!(await stat(path)).isFile()) throw Error();
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(5187, "0.0.0.0", () => {
  console.log("Local: http://localhost:5187");
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(`Network: http://${n.address}:5187`);
});
