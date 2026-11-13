// Walks the I3S service like a client would and checks every node resource.
// Usage: node test/check.js [baseUrl]   (default http://localhost:3000)
const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

async function get(path, expectType) {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  const type = r.headers.get("content-type") || "";
  if (expectType && !type.startsWith(expectType)) throw new Error(`bad content-type ${type} for ${path}`);
  return r;
}

(async () => {
  const svc = await (await get("/Mesh/SceneServer", "application/json")).json();
  const layer = await (await get("/Mesh/SceneServer/layers/0", "application/json")).json();
  if (!svc.layers || svc.layers.length !== 1) throw new Error("service has no layer");
  if (!layer.fullExtent) throw new Error("layer has no fullExtent");
  await get("/", "text/html");

  const perPage = layer.nodePages.nodesPerPage;
  const tsd = [].concat(layer.textureSetDefinitions || [])[0];
  const formats = tsd ? tsd.formats.map((f) => f.name) : [];
  const geoms = layer.geometryDefinitions[0].geometryBuffers.length;
  let page = 0, nodes = [];
  for (;;) {
    const r = await fetch(`${base}/Mesh/SceneServer/layers/0/nodepages/${page}`);
    if (r.status === 404) break;
    if (!r.ok) throw new Error(`${r.status} nodepage ${page}`);
    const np = await r.json();
    nodes.push(...np.nodes);
    if (np.nodes.length < perPage) break;
    page++;
  }

  const paths = [];
  for (const n of nodes) {
    if (!n.mesh) continue;
    const res = n.mesh.geometry ? n.mesh.geometry.resource : n.index;
    for (let g = 0; g < geoms; g++) paths.push(`/Mesh/SceneServer/layers/0/nodes/${res}/geometries/${g}`);
    if (n.mesh.material) for (const f of formats) paths.push(`/Mesh/SceneServer/layers/0/nodes/${res}/textures/${f}`);
  }

  let ok = 0, failed = [];
  for (let i = 0; i < paths.length; i += 32) {
    await Promise.all(paths.slice(i, i + 32).map((p) =>
      fetch(base + p, { method: "HEAD" }).then((r) => (r.ok ? ok++ : failed.push(`${r.status} ${p}`)))));
  }
  const bad = await fetch(`${base}/Mesh/SceneServer/layers/0/../../server.js`);
  console.log(`nodes: ${nodes.length}, resources checked: ${paths.length}, ok: ${ok}, failed: ${failed.length}`);
  console.log(`path traversal blocked: ${bad.status !== 200 || !(await bad.text()).includes("createServer")}`);
  if (failed.length) { console.log(failed.slice(0, 10).join("\n")); process.exit(1); }
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
