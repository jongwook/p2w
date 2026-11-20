'use strict';
const RELEASE="2fae0bf8a85dadc3033b5b951ea4d10728035612dd567da9dea388723796975e";
const FILES=[{"path":"app.webmanifest","bytes":562,"sha256":"d71b7eb9976c1851b18100fbe28e8664c2761b54345def3a8efaf6043568a5b4"},{"path":"apple-touch-icon.png","bytes":1199,"sha256":"e9896e3fd404faaff6fb54fd6845d5f4d173219971080113ef056ef3105c557d"},{"path":"en/index.data","bytes":11801874,"sha256":"8832fcedf116fd09026a2da0932afd00766b424af7eff3b429ecffecdff81153"},{"path":"en/index.js","bytes":261901,"sha256":"501c9392a8283d97ef06750f437a502f939a758663ea34ea2601ba03873f34e5"},{"path":"en/index.wasm","bytes":3170004,"sha256":"67bf0d710d5282f919b48edcbeac65784d9db014e918be0e95d149e9ae1f13e7"},{"path":"favicon.ico","bytes":766,"sha256":"3a3493c1e491301f79742fbc2679227f2f57c50fdc3152787084bb3602617c11"},{"path":"icon-192.png","bytes":1256,"sha256":"7c11fa62e2093f17ddd6026203a48f96b5658f9daa495fbf9f8525fe92d40efd"},{"path":"icon-512.png","bytes":6688,"sha256":"781e4113e98a2fc460caed135178b173e605e3cfb9bede32922644d8ed7963aa"},{"path":"icon-maskable-512.png","bytes":5395,"sha256":"91bc08fb637eb65900c4c4502d5021764fb5217c9f0fe86b23bf3bef58f410c6"},{"path":"index.html","bytes":80309,"sha256":"c62743a72a84bcd9ff198f8d7c644fde0565158549eeecaa5f302d8e5b6e4419"},{"path":"ja/index.data","bytes":11564516,"sha256":"c433830fc1176c24a191e56ca90f52c940faf621df4449ca7e756e863ff491f6"},{"path":"ja/index.js","bytes":261901,"sha256":"1025f03e83058121553916fe36aa62f24311c64499ac62080036f63e6cf8e4b7"},{"path":"ja/index.wasm","bytes":3160745,"sha256":"2577af11bb36046d3b7fc45b674cd53310eb5037119f8b32bb4af1da54bfaed0"},{"path":"ko/index.data","bytes":11388778,"sha256":"c4f2046c4f4bd82d7b33e47d0275f767602423d6ba1be94430e6704206be459d"},{"path":"ko/index.js","bytes":261901,"sha256":"814811862ad57f6ae4f8a5021369698a470239f98a1c00e903a275af03ccdeb3"},{"path":"ko/index.wasm","bytes":3159461,"sha256":"f482bab3b49931a3e7bddb513b8f8cc2db883e94332f971f0603783a06632f46"}];
// RELEASE and FILES are generated from the complete, verified package.
const base = new URL(self.registration.scope);
const prefix = 'p2w-offline:' + encodeURIComponent(base.href) + ':';
const cacheName = prefix + RELEASE;
const readyURL = new URL('__offline_ready__', base).href;
const entries = new Map(FILES.map(file => [new URL(file.path, base).href, file]));
let repair = null;

async function verifiedBytes(response, file) {
  if (!response?.ok) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== file.bytes) return null;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  if (Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') !== file.sha256) return null;
  return bytes;
}
function decodedResponse(bytes, response) {
  // Fetch already decoded the payload. Cache a self-contained response with
  // its MIME type and decoded length, independent of HTTP content negotiation.
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.delete('Vary');
  headers.set('Content-Length', String(bytes.byteLength));
  return new Response(bytes, {headers});
}
async function download(file) {
  const response = await fetch(new URL(file.path, base), {cache:'no-store', credentials:'same-origin', redirect:'error'});
  const bytes = await verifiedBytes(response, file);
  if (!bytes) throw new Error('The download is incomplete or belongs to another release.');
  return decodedResponse(bytes, response);
}
async function readCached(cache, file) {
  try {
    const response = await cache.match(new URL(file.path, base));
    const bytes = await verifiedBytes(response, file);
    if (bytes) return {bytes, response};
  } catch {
    // A stored entry can exist while its backing file can no longer be read.
  }
  return null;
}
async function notify(message) {
  for (const client of await self.clients.matchAll({type:'window', includeUncontrolled:true})) {
    if (client.url.startsWith(base.href)) client.postMessage({kind:'p2w-offline', release:RELEASE, ...message});
  }
}
async function fill(cache) {
  let completed = 0;
  const total = FILES.reduce((sum, file) => sum + file.bytes, 0);
  for (const file of FILES) {
    const url = new URL(file.path, base).href;
    if (!await readCached(cache, file)) {
      try { await cache.put(url, await download(file)); }
      catch (error) { throw new Error(`Could not save ${file.path}: ${error.message}`); }
    }
    completed += file.bytes;
    await notify({state:'downloading', completed, total});
  }
  await cache.put(readyURL, new Response(RELEASE));
}
async function complete() {
  if (!await caches.has(cacheName)) return false;
  const cache = await caches.open(cacheName);
  if ((await (await cache.match(readyURL))?.text()) !== RELEASE) return false;
  for (const file of FILES) if (!await readCached(cache, file)) return false;
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      await fill(await caches.open(cacheName));
      await notify({state:'downloaded'});
    } catch (error) {
      await caches.delete(cacheName);
      await notify({state:'failed', message:error.message});
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  // No skipWaiting or clients.claim: old pages keep their complete release.
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    }
    await notify({state:'active'});
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== base.origin) return;
  url.search = ''; url.hash = '';
  if (url.href === base.href) url.pathname += 'index.html';
  const file = entries.get(url.href);
  if (!file) return; // Diagnostics and unrelated sites are never cached.
  event.respondWith((async () => {
    const cache = await caches.open(cacheName).catch(() => null);
    const cached = cache && await readCached(cache, file);
    if (cached) return decodedResponse(cached.bytes, cached.response);
    try {
      // A missing old asset may only be repaired with the exact old bytes.
      const response = await download(file);
      // Storage can be full or disabled while the network still works.
      if (cache) await cache.put(url.href, response.clone()).catch(() => {});
      return response;
    } catch {
      await notify({state:'missing'});
      if (event.request.mode === 'navigate' && file.path === 'index.html') {
        return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline game unavailable</title><main><h1>Offline game unavailable</h1><p>The start screen is missing from this app. Reconnect to the internet, then reopen p2w to download it again.</p><a href="./">Reopen p2w</a></main>',
          {status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      }
      return new Response('This offline game file is unavailable. Reconnect, close all p2w windows and reopen the game.',
        {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
let checking;
self.addEventListener('message', event => {
  if (!event.source?.url?.startsWith(base.href) || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      if (event.data?.kind === 'repair') {
        if (!repair) repair = fillPromise();
        await repair;
      } else if (event.data?.kind !== 'status') return;
      checking ??= complete().finally(() => { checking = null; });
      port.postMessage({release:RELEASE, ready:await checking});
    } catch (error) { port.postMessage({release:RELEASE, ready:false, error:error.message}); }
  })());
});
async function fillPromise() {
  try { await fill(await caches.open(cacheName)); }
  finally { repair = null; }
}
