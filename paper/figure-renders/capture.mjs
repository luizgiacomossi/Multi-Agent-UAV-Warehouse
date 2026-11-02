// Saves a PNG of showcase.html for one model, through a headless Chrome started with
// --remote-debugging-port=9333 --use-angle=swiftshader --enable-unsafe-swiftshader.
// Usage: node capture.mjs <drone|forklift|pallet> <out.png>
import fs from 'node:fs';

const [obj, out] = process.argv.slice(2);
const target = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 800, deviceScaleFactor: 3, mobile: false });
await send('Page.navigate', { url: `http://localhost:3000/paper/figure-renders/showcase.html?obj=${obj}` });
await new Promise(r => setTimeout(r, 7000));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
await send('Page.close');
ws.close();
