// Minimal I3S SceneServer for an extracted SLPK. No dependencies.
// Routes:
//   /                                   -> public/index.html
//   /SceneServer                        -> service document
//   /SceneServer/layers/0               -> layer document (3dSceneLayer.json.gz)
//   /SceneServer/layers/0/<resource>    -> nodepages, geometries, textures, ...
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data");
const PUBLIC = path.join(__dirname, "public");
const LAYER_NAME = process.env.LAYER_NAME || "Mesh";

// Layer document, with fullExtent filled in from store.extent when missing
// (the JS API needs it to zoom to the layer).
const layer = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DATA, "3dSceneLayer.json.gz"))));
if (!layer.fullExtent && layer.store && Array.isArray(layer.store.extent)) {
  const [xmin, ymin, xmax, ymax] = layer.store.extent;
  layer.fullExtent = { xmin, ymin, xmax, ymax, spatialReference: layer.spatialReference };
}
const layerBody = Buffer.from(JSON.stringify(layer));
const serviceBody = Buffer.from(JSON.stringify({
  serviceName: LAYER_NAME,
  name: LAYER_NAME,
  currentVersion: 11.3,
  serviceVersion: layer.store && layer.store.version ? layer.store.version : "1.9",
  supportedBindings: ["REST"],
  layers: [layer],
}));

// Candidate on-disk names for a REST resource path, in priority order.
const EXTS = [".json.gz", ".bin.gz", ".jpg", ".ktx2", ".png", ".bin.dds", ""];
const TYPES = { ".json": "application/json", ".bin": "application/octet-stream", ".jpg": "image/jpeg",
  ".png": "image/png", ".ktx2": "image/ktx2", ".dds": "image/vnd-ms.dds", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain" };

function resolveResource(rel) {
  const base = path.normalize(path.join(DATA, rel));
  if (!base.startsWith(DATA + path.sep)) return null; // path traversal guard
  const candidates = EXTS.map((e) => base + e);
  if (/[\\/]nodes[\\/][^\\/]+$/.test(base)) candidates.unshift(path.join(base, "3dNodeIndexDocument.json.gz"));
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

function contentType(file) {
  const inner = file.endsWith(".gz") ? file.slice(0, -3) : file;
  return TYPES[path.extname(inner).toLowerCase()] || "application/octet-stream";
}

function send(req, res, status, body, type, extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", ...extra });
  res.end(req.method === "HEAD" ? undefined : body);
}

function sendFile(req, res, file, cache) {
  const headers = { "Content-Type": contentType(file), "Access-Control-Allow-Origin": "*",
    "Cache-Control": cache };
  const gz = file.endsWith(".gz");
  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (gz && acceptsGzip) headers["Content-Encoding"] = "gzip";
  if (!gz || acceptsGzip) headers["Content-Length"] = fs.statSync(file).size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  const stream = fs.createReadStream(file);
  (gz && !acceptsGzip ? stream.pipe(zlib.createGunzip()) : stream).pipe(res);
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    return send(req, res, 204, "", "text/plain", { "Access-Control-Allow-Methods": "GET, HEAD",
      "Access-Control-Allow-Headers": "*" });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(req, res, 405, "Method not allowed", "text/plain");

  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/+$/, "") || "/"; }
  catch { return send(req, res, 400, "Bad request", "text/plain"); }

  if (p === "/healthz") return send(req, res, 200, "ok", "text/plain");
  if (p === "/SceneServer") return send(req, res, 200, serviceBody, "application/json", { "Cache-Control": "public, max-age=3600" });
  if (p === "/SceneServer/layers/0") return send(req, res, 200, layerBody, "application/json", { "Cache-Control": "public, max-age=3600" });

  const m = p.match(/^\/SceneServer\/layers\/0\/(.+)$/);
  if (m) {
    const file = resolveResource(m[1]);
    return file ? sendFile(req, res, file, "public, max-age=604800, immutable")
                : send(req, res, 404, JSON.stringify({ error: { code: 404, message: "Not found" } }), "application/json");
  }

  // Static viewer
  const rel = p === "/" ? "index.html" : p.slice(1);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(req, res, file, "public, max-age=300");
  }
  send(req, res, 404, "Not found", "text/plain");
}).listen(PORT, () => console.log(`I3S server on http://localhost:${PORT}`));
