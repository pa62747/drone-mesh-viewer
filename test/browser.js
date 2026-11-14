// Headless browser test: loads the viewer in Edge/Chrome via the DevTools protocol, opens every tool,
// collects console errors and saves screenshots.
// Usage: node test/browser.js <pageUrl> <outDir> [browserPath]
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const pageUrl = process.argv[2] || "http://localhost:3000/";
const outDir = process.argv[3] || path.join(os.tmpdir(), "mesh-viewer-test");
const browser = process.argv[4] || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9333;
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const proc = spawn(browser, ["--headless=new", `--remote-debugging-port=${port}`, "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader", "--no-first-run", "--window-size=1400,900",
    `--user-data-dir=${path.join(outDir, "profile")}`, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {}
  }
  if (!target) throw new Error("browser did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map(); const errors = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.exceptionThrown") errors.push("exception: " + msg.params.exceptionDetails.exception?.description?.split("\n")[0]);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
      errors.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error")
      errors.push("log: " + msg.params.entry.text.slice(0, 200) + " " + (msg.params.entry.url || ""));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(outDir, name + ".png"), Buffer.from(r.result.data, "base64"));
  };
  const waitIdle = async (max = 60000) => {
    const t0 = Date.now();
    await sleep(1500);
    while (Date.now() - t0 < max) {
      const busy = await evaluate("window.view ? (window.view.updating || !window.view.ready) : true");
      if (busy === false) return true;
      await sleep(500);
    }
    return false;
  };

  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Page.navigate", { url: pageUrl });
  const idle = await waitIdle(90000);
  console.log("view idle:", idle);
  console.log("status:", await evaluate("document.getElementById('status').textContent"));
  console.log("mask on:", await evaluate("!!window.view.map.layers.getItemAt(0).modifications"));
  await shot("01-initial");

  const ids = await evaluate("[...document.querySelectorAll('#tools button')].map(b => b.dataset.id)");
  for (const t of ids) {
    const before = errors.length;
    await evaluate(`document.querySelector('#tools button[data-id="${t}"]').click()`);
    await sleep(2500);
    const panel = await evaluate("document.getElementById('panelBody').innerText.trim().slice(0,80).replace(/\\n/g,' | ')");
    if (t === "swipe") {
      await evaluate("(() => { const r = document.getElementById('swipeRange'); r.value = 300; r.dispatchEvent(new Event('input')); })()");
      await waitIdle(20000); await shot("02-swipe");
    }
    if (t === "sun") { await waitIdle(20000); await shot("03-sun"); }
    console.log(`tool ${t}: panel="${panel}" newErrors=${errors.length - before}`);
  }
  await evaluate("document.getElementById('panelClose').click()");

  // walk mode: click a point in the scene, hold W, check the camera moved at eye height
  if (ids.includes("walk")) {
    await evaluate(`document.querySelector('#tools button[data-id="walk"]').click()`);
    await sleep(1500);
    const mouse = (type) => send("Input.dispatchMouseEvent", { type, x: 520, y: 520, button: "left", clickCount: 1 });
    await mouse("mousePressed"); await mouse("mouseReleased");
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      if ((await evaluate("document.getElementById('walkMsg').textContent")).startsWith("גובה קרקע")) break;
    }
    await sleep(500);
    const cam = "(() => { const c = window.view.camera; return { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2), tilt: +c.tilt.toFixed(1), heading: +c.heading.toFixed(1) }; })()";
    const c1 = await evaluate(cam);
    console.log("walk start camera:", JSON.stringify(c1), "msg:", await evaluate("document.getElementById('walkMsg').textContent"));
    const key = (type) => send("Input.dispatchKeyEvent", { type, key: "w", code: "KeyW", windowsVirtualKeyCode: 87 });
    await key("keyDown"); await sleep(1500); await key("keyUp");
    await sleep(800);
    const c2 = await evaluate(cam);
    console.log("walk after W 1.5s:", JSON.stringify(c2), "moved m:", Math.hypot(c2.x - c1.x, c2.y - c1.y).toFixed(2));
    await waitIdle(20000); await shot("04-walk");
    await evaluate("document.getElementById('panelClose').click()");
    await sleep(1500);
    console.log("camera restored after exit, tilt:", (await evaluate(cam)).tilt);
  }

  console.log("errors:", errors.length ? "\n  " + errors.join("\n  ") : "none");
  ws.close(); proc.kill();
  setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
