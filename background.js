
// background.js - aggressive param variants for SaveSora
const perfNow = (typeof performance !== 'undefined' && typeof performance.now === 'function') ? () => performance.now() : () => Date.now();
const API_ENDPOINTS = [
  'https://savesora.com/api/download-video-new',
  'https://savesora.com/api/download-video',
  'https://savesora.com/api/download'
];
const PROXY_ENDPOINTS = [
  'https://savesora.com/api/proxy-download?url=__ENC__',
  'https://savesora.com/api/proxy-download-2?url=__ENC__',
  'https://savesora.com/api/proxy-download?server=2&url=__ENC__'
];
const GET_PARAM_NAMES = ['url','link','videoUrl','share_url','video_url','u'];

const DEFAULT_OPTS = {
  autoDownload: true,
  useMirrorFallback: true,
  testSpeed: true,
  timeoutMs: 8000,
  filenamePattern: '{prompt}-{id}-{date}_{time}',
  preferredMethod: 'auto' // 'auto' | 'save' | 'alt'
};

let LAST_DEBUG = { request: null, responses: [] };

function safeAtobBase64(input) {
  try {
    if (typeof input !== 'string' || !input) return null;
    // Normalize URL-safe base64
    let s = input.replace(/-/g, '+').replace(/_/g, '/');
    // Pad as needed
    while (s.length % 4 !== 0) s += '=';
    const dec = atob(s);
    return dec;
  } catch { return null; }
}

function tryDecodeToUrl(maybeEncoded) {
  const dec = safeAtobBase64(maybeEncoded);
  if (!dec) return null;
  try {
    const trimmed = dec.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Some encodes may wrap an URL param
    const asUrl = new URL('https://stub.local/?v=' + encodeURIComponent(trimmed));
    const v = asUrl.searchParams.get('v') || '';
    if (/^https?:\/\//i.test(v)) return v;
  } catch {}
  return null;
}

function synthesizeProxyFromEncoded(maybeEncoded) {
  try {
    if (typeof maybeEncoded !== 'string' || !maybeEncoded.trim()) return null;
    return `https://savesora.com/api/proxy-download?url=${encodeURIComponent(maybeEncoded.trim())}`;
  } catch { return null; }
}

async function fetchViaSavesoraTab(soraUrl) {
  // Open a background tab at savesora.com and perform the POST there
  const created = await chrome.tabs.create({ url: 'https://savesora.com/vi/', active: false });
  const tabId = created.id;
  try {
    // Wait briefly for load
    await new Promise(r => setTimeout(r, 800));
    const resArr = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (shareUrl) => {
        const tries = [];
        const jsonHeaders = { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest', 'accept': 'application/json, text/plain, */*' };
        const formHeaders = { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', 'accept': 'application/json, text/plain, */*' };
        const qs = (k) => new URLSearchParams({ [k]: shareUrl }).toString();
        const keys = ['url','link','videoUrl','share_url','video_url','u'];
        // Minimal JSON { url }
        tries.push(() => fetch('https://savesora.com/api/download-video-new', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ url: shareUrl }) }));
        // JSON with all key variants
        keys.forEach(k => tries.push(() => fetch('https://savesora.com/api/download-video-new', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ [k]: shareUrl }) })));
        // Form URL Encoded
        keys.forEach(k => tries.push(() => fetch('https://savesora.com/api/download-video-new', { method: 'POST', headers: formHeaders, body: qs(k) })));
        // GET with query
        keys.forEach(k => tries.push(() => fetch(`https://savesora.com/api/download-video-new?${qs(k)}`, { method: 'GET', headers: { 'x-requested-with': 'XMLHttpRequest', 'accept': 'application/json, text/plain, */*' } })));
        // Also older endpoints
        const eps = ['https://savesora.com/api/download-video', 'https://savesora.com/api/download'];
        eps.forEach(ep => keys.forEach(k => tries.push(() => fetch(`${ep}?${qs(k)}`, { method: 'GET', headers: { 'x-requested-with': 'XMLHttpRequest', 'accept': 'application/json, text/plain, */*' } }))));
        for (const t of tries) {
          try {
            const resp = await t();
            const data = await resp.json().catch(()=>({}));
            if (resp.ok && (data?.data || data?.url || data?.downloadUrl)) return { ok: true, status: resp.status, data };
          } catch {}
        }
        return { ok: false };
      },
      args: [soraUrl]
    });
    const out = resArr?.[0]?.result || { ok: false };
    LAST_DEBUG.responses.push({ phase: 'TAB_POST', endpoint: 'https://savesora.com/api/download-video-new', status: out.status, parsed: out.data || out });
    if (out.ok && out.data) return out.data;
    return null;
  } catch (e) {
    LAST_DEBUG.responses.push({ phase: 'TAB_POST_ERR', error: e?.message || String(e) });
    return null;
  } finally {
    try { if (tabId) await chrome.tabs.remove(tabId); } catch {}
  }
}

function buildSavesoraHeaders(soraUrl) {
  const h = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.8',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'x-requested-with': 'XMLHttpRequest',
    'authorization': 'Bearer null'
  };
  try { h['referer'] = 'https://savesora.com/vi/'; } catch {}
  try { h['origin'] = 'https://savesora.com'; } catch {}
  return h;
}

async function getOpts() {
  const r = await chrome.storage.sync.get(DEFAULT_OPTS);
  return Object.assign({}, DEFAULT_OPTS, r);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'download-sora-page', title: 'Download Sora video', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'download-sora-link', title: 'Download Sora video (link)', contexts: ['link'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const incoming = info.linkUrl || info.pageUrl || (tab && tab.url);
    if (!incoming) throw new Error('No URL found.');
    const result = await resolveDownloadLink(incoming);
    const opts = await getOpts();
    const filename = makeFilename(opts.filenamePattern, result.meta);
    await startDownload(result.url, filename);
    notify('Download started', filename);
  } catch (err) { notify('Error', err.message || String(err)); }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'FETCH_DOWNLOAD') {
        LAST_DEBUG = { request: { soraUrl: msg.soraUrl, meta: msg.meta || {}, when: Date.now() }, responses: [] };
        const result = await resolveDownloadLink(msg.soraUrl, msg.meta, msg.preferredMethod);
        const opts = await getOpts();
        const filename = makeFilename(msg.filenamePattern || opts.filenamePattern, result.meta);
        if (msg.autoDownload ?? opts.autoDownload) await startDownload(result.url, filename);
        sendResponse({ ok: true, url: result.url, filename, raw: result.raw, meta: result.meta, alts: result.alts || [], debug: LAST_DEBUG });
      } else if (msg.type === 'DIRECT_DOWNLOAD') {
        LAST_DEBUG = { request: { directUrl: msg.url, meta: msg.meta || {}, when: Date.now() }, responses: LAST_DEBUG.responses || [] };
        const opts = await getOpts();
        const filename = makeFilename(msg.filenamePattern || opts.filenamePattern, msg.meta || {});
        await startDownload(msg.url, filename);
        sendResponse({ ok: true });
      } else if (msg.type === 'SAVE_OPTS') {
        await chrome.storage.sync.set(msg.opts || {});
        sendResponse({ ok: true });
      } else if (msg.type === 'GET_OPTS') {
        const opts = await getOpts();
        sendResponse({ ok: true, opts });
      } else if (msg.type === 'GET_DEBUG_LAST') {
        sendResponse({ ok: true, debug: LAST_DEBUG });
      } else {
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) { sendResponse({ ok: false, error: e.message || String(e) }); }
  })();
  return true;
});

async function resolveDownloadLink(soraUrl, meta = {}, preferredMethod) {
  LAST_DEBUG = { request: { soraUrl, meta }, responses: [] };
  let lastError = null;
  let parsed = null;
  const method = (preferredMethod || (await getOpts()).preferredMethod || 'auto');

  const trySave = async () => {
    // 0) Try via savesora tab context first (most compatible)
    try {
      const viaTab = await fetchViaSavesoraTab(soraUrl);
      if (viaTab) {
        const sel0 = await selectBestUrl(viaTab, soraUrl);
        const dl0 = sel0.best;
        if (dl0) {
          const metaFinal = enrichMeta(meta, soraUrl, viaTab);
          const final = await maybeMirror(dl0, metaFinal);
          return { url: final, raw: viaTab, meta: metaFinal, alts: sel0.candidates };
        }
      }
    } catch (e) { lastError = e; }

    // 1) POST variants
    for (const endpoint of API_ENDPOINTS) {
      const postAttempts = makePostAttempts(soraUrl);
      for (const attempt of postAttempts) {
        try {
          const res = await fetch(attempt.url || endpoint, {
            method: 'POST', headers: Object.assign({}, buildSavesoraHeaders(soraUrl), attempt.headers), body: attempt.body, mode: 'cors', cache: 'no-store'
          });
          parsed = await safeParse(res);
          LAST_DEBUG.responses.push({ phase: 'POST', endpoint: attempt.url || endpoint, enc: attempt.enc, status: res.status, headers: Object.fromEntries(res.headers.entries()), parsed });
          if (!res.ok) { lastError = new Error(`API HTTP ${res.status}`); continue; }
          const sel1 = await selectBestUrl(parsed, soraUrl);
          const dl = sel1.best;
          if (dl) {
            const metaFinal = enrichMeta(meta, soraUrl, parsed);
            const final = await maybeMirror(dl, metaFinal);
            return { url: final, raw: parsed, meta: metaFinal, alts: sel1.candidates };
          }
        } catch (e) { lastError = e; }
      }
    }

    // 2) GET variants
    for (const endpoint of API_ENDPOINTS) {
      for (const p of GET_PARAM_NAMES) {
        try {
          const u = new URL(endpoint); u.searchParams.set(p, soraUrl);
          const res = await fetch(u.toString(), { method: 'GET', headers: Object.assign({}, buildSavesoraHeaders(soraUrl), { 'accept': '*/*' }), mode: 'cors', cache: 'no-store' });
          parsed = await safeParse(res);
          LAST_DEBUG.responses.push({ phase: 'GET', endpoint: u.toString(), status: res.status, headers: Object.fromEntries(res.headers.entries()), parsed });
          if (!res.ok) { lastError = new Error(`API HTTP ${res.status}`); continue; }
          const sel2 = await selectBestUrl(parsed, soraUrl);
          const dl = sel2.best;
          if (dl) {
            const metaFinal = enrichMeta(meta, soraUrl, parsed);
            const final = await maybeMirror(dl, metaFinal);
            return { url: final, raw: parsed, meta: metaFinal, alts: sel2.candidates };
          }
        } catch (e) { lastError = e; }
      }
    }
    return null;
  };

  const tryAlt = async () => {
    try {
      const direct = await scanActiveTabForDirectLinks();
      if (direct && direct.length) {
        const pick = selectBestFromList(direct);
        if (pick) {
          const metaFinal = enrichMeta(meta, soraUrl, { data: { candidates: direct } });
          return { url: pick, raw: { candidates: direct }, meta: metaFinal, alts: direct.map(u=>({url:u,label:'direct'})) };
        }
      }
    } catch (e) { lastError = e; }
    return null;
  };

  const order = method === 'save' ? [trySave, tryAlt] : method === 'alt' ? [tryAlt, trySave] : [trySave, tryAlt];
  for (const fn of order) {
    const r = await fn();
    if (r && r.url) return r;
  }

  // 3) Give up
  throw lastError || new Error('No proxy URL found in API response');
}

function makePostAttempts(soraUrl) {
  const headersJSON = { 'content-type': 'application/json;charset=UTF-8' };
  try { headersJSON['referer'] = String(soraUrl); } catch {}
  const jsonBodies = [
    { url: soraUrl }, { link: soraUrl }, { videoUrl: soraUrl },
    { share_url: soraUrl }, { video_url: soraUrl }, { u: soraUrl }
  ];

  const headersForm = { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' };
  try { headersForm['referer'] = String(soraUrl); } catch {}
  const makeQS = (k) => new URLSearchParams({ [k]: soraUrl }).toString();
  const formBodies = ['url','link','videoUrl','share_url','video_url','u'].map(k => makeQS(k));

  // Some servers expect the param in querystring even for POST
  const endpointsWithQuery = [];
  for (const ep of API_ENDPOINTS) {
    for (const k of GET_PARAM_NAMES) {
      const u = new URL(ep); u.searchParams.set(k, soraUrl); endpointsWithQuery.push(u.toString());
    }
  }

  const attempts = [];
  // Minimal-first attempt matching observed request shape
  attempts.push({ enc: 'json-min', headers: Object.assign({}, headersJSON), body: JSON.stringify({ url: soraUrl }) });
  jsonBodies.forEach(b => attempts.push({ enc: 'json', headers: headersJSON, body: JSON.stringify(b) }));
  formBodies.forEach(b => attempts.push({ enc: 'form', headers: headersForm, body: b }));

  // Multipart/form-data (let browser set the boundary automatically)
  const addMultipart = () => {
    const ks = ['url','link','videoUrl','share_url','video_url','u'];
    ks.forEach(k => {
      const fd = new FormData(); fd.append(k, soraUrl);
      attempts.push({ enc: 'multipart', headers: { 'accept': 'application/json', 'referer': String(soraUrl) }, body: fd });
    });
  };
  addMultipart();

  // JSON but url in querystring too
  endpointsWithQuery.forEach(u => attempts.push({ enc: 'json+qs', url: u, headers: headersJSON, body: JSON.stringify({}) }));

  return attempts;
}

async function safeParse(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await res.json();
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t, asText: t }; }
}

function collectUrls(obj) {
  const urls = new Set();
  const scan = (v) => {
    if (!v) return;
    if (typeof v === 'string') {
      const re = /(https?:\/\/[^\s"']+)/g; let m; while ((m = re.exec(v))) urls.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(scan);
    else if (typeof v === 'object') for (const k in v) scan(v[k]);
  };
  scan(obj);
  return Array.from(urls);
}

async function selectBestUrl(data, original) {
  const candidates = [];
  const push = (u)=> { if (typeof u === 'string') candidates.push(u); };
  try {
    push(data?.downloadUrl); push(data?.url); push(data?.noWatermarkUrl); push(data?.nowm);
    push(data?.data?.downloadUrl); push(data?.data?.url); push(data?.data?.noWatermarkUrl); push(data?.data?.nowm);
  } catch {}
  try {
    const jsonStr = JSON.stringify(data);
    const reProxy = /https?:\/\/savesora\.com\/api\/proxy-download[^\s"\\]+/g;
    let m; while ((m = reProxy.exec(jsonStr))) push(m[0].replace(/\\\//g,'/'));
  } catch {}
  // Try decode common encoded fields
  try {
    const d = data?.data || data;
    const encKeys = ['encoded_video_url','encoded_video_url01','nowatermarked_video_url','noWatermark','nowm'];
    encKeys.forEach(k => {
      const val = d?.[k];
      const dec = tryDecodeToUrl(val);
      if (dec) push(dec);
      const prox = synthesizeProxyFromEncoded(val);
      if (prox) push(prox);
    });
  } catch {}
  collectUrls(data).forEach(push);
  const uniq = Array.from(new Set(candidates));
  const isImageLike = (u) => /\.(webp|png|jpe?g|gif|svg)(\?|$)/i.test(u) || /thumbnail|thumbs?/i.test(u);
  const isVideoLike = (u) => /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(u) || /m3u8(\?|$)/i.test(u);
  const labelOf = (u) => {
    const m1 = u.match(/(?:quality|q|res|resolution)=([0-9]{3,4}p?)/i);
    const m2 = u.match(/([0-9]{3,4}p)\b/i);
    if (m1) return m1[1];
    if (m2) return m2[1];
    if (/nowm|no\s*watermark/i.test(u)) return 'no-watermark';
    return 'auto';
  };
  const alts = uniq
    .filter(u => !isImageLike(u))
    .filter(u => isVideoLike(u) || /proxy-download/.test(u))
    .map(u => ({ url: /proxy-download/.test(u) ? u : synthesizeProxyIfNeeded(u), label: labelOf(u) }))
    .filter(x => !!x.url);
  const proxy = alts.find(x => /savesora\.com\/api\/proxy-download/.test(x.url));
  if (proxy) return { best: proxy.url, candidates: alts };
  const mp4 = alts.find(x => /\.mp4(\?|$)/i.test(x.url));
  if (mp4) return { best: mp4.url, candidates: alts };
  const any = uniq.find(u => /^https?:\/\//.test(u));
  if (any) return { best: synthesizeProxyIfNeeded(any), candidates: alts };
  return { best: null, candidates: alts };
}

function synthesizeProxyIfNeeded(inner) {
  try { return `https://savesora.com/api/proxy-download?url=${encodeURIComponent(inner)}`; }
  catch { return null; }
}

async function maybeMirror(url, meta) {
  const opts = await getOpts();
  if (!(opts.useMirrorFallback || opts.testSpeed)) return url;
  const innerEnc = (()=>{
    try { const u = new URL(url); const inner = u.searchParams.get('url'); return inner ? encodeURIComponent(inner) : null; }
    catch { return null; }
  })();
  const probes = [url];
  if (innerEnc) {
    for (const tmpl of PROXY_ENDPOINTS) {
      const u = tmpl.replace('__ENC__', innerEnc);
      if (!probes.includes(u)) probes.push(u);
    }
  }
  const { timeoutMs } = await getOpts();
  const tested = await Promise.all(probes.map(p => probeUrl(p, timeoutMs)));
  const ok = tested.filter(t => t.ok);
  if (ok.length === 0) return url;
  ok.sort((a,b) => a.ms - b.ms);
  return ok[0].url;
}

async function probeUrl(url, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  const started = perfNow();
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-0' }, signal: ctrl.signal });
    const ms = perfNow() - started;
    clearTimeout(to);
    return { url, ok: res.ok, status: res.status, ms };
  } catch (e) {
    clearTimeout(to);
    return { url, ok: false, error: e.message || String(e), ms: perfNow() - started };
  }
}

async function scanActiveTabForDirectLinks() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return [];
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const urls = new Set();
        const add = (u) => { try { if (typeof u === 'string' && /https?:\/\//.test(u)) urls.add(u); } catch {} };
        // attributes
        document.querySelectorAll('[href],[src]').forEach(el => { add(el.getAttribute('href')); add(el.getAttribute('src')); });
        // sources inside video
        document.querySelectorAll('source').forEach(s => add(s.getAttribute('src')));
        // raw text nodes heuristic
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; const re = /(https?:\/\/[^\s"'<>]+)/g; 
        while ((n = walker.nextNode())) { const t = (n.nodeValue||''); let m; while ((m = re.exec(t))) add(m[1]); }
        return Array.from(urls);
      }
    }).then(r => r?.[0]?.result || []).catch(() => []);
    // filter for alt domains (OpenAI videos/ss2 mirrors)
    const wanted = res.filter(u => /\b(videos\d*\.ss2\.life|videos\.openai\.com)\/az\/files\//.test(u) || /\/az\/files\//.test(u));
    LAST_DEBUG.responses.push({ phase: 'ALT_SCAN', found: wanted.length });
    // rank by size (highest quality): HEAD/GET to get content-length
    const sized = await rankByContentLength(wanted, (await getOpts()).timeoutMs);
    return sized;
  } catch { return []; }
}

function selectBestFromList(list) {
  const uniq = Array.from(new Set(list));
  // prefer raw endpoints and mp4
  const raw = uniq.find(u => /\/raw(\?|$)/.test(u)); if (raw) return raw;
  const mp4 = uniq.find(u => /\.mp4(\?|$)/i.test(u)); if (mp4) return mp4;
  return uniq[0] || null;
}

async function rankByContentLength(urls, timeoutMs) {
  const limited = Array.from(new Set(urls));
  const probes = await Promise.all(limited.map(u => probeContentLength(u, timeoutMs)));
  const ok = probes.filter(p => p.ok);
  if (ok.length === 0) return limited;
  ok.sort((a,b) => (b.size||0) - (a.size||0));
  return ok.map(p => p.url);
}

async function probeContentLength(url, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    // Try HEAD first
    let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    let len = parseInt(res.headers.get('content-length') || '0', 10);
    if (!res.ok || !len) {
      // Fallback to GET Range small bytes to coax headers
      res = await fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-0' }, signal: ctrl.signal });
      len = parseInt(res.headers.get('content-length') || '0', 10);
    }
    clearTimeout(to);
    return { url, ok: true, size: isFinite(len) ? len : 0 };
  } catch (e) {
    clearTimeout(to);
    return { url, ok: false, error: e?.message || String(e) };
  }
}

function sanitize(s) {
  return (s || '').toString().replace(/\s+/g, ' ').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
}

function makeFilename(pattern, meta) {
  const now = new Date();
  const pad = (n)=> String(n).padStart(2,'0');
  const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const ts = `${date}_${time}`;
  const id = sanitize(meta?.id || '');
  const prompt = sanitize(meta?.prompt || 'sora-video');
  const rand = Math.random().toString(36).slice(2,8);
  const map = { '{prompt}': prompt || 'sora-video', '{id}': id || rand, '{date}': date, '{time}': time, '{ts}': ts, '{rand}': rand };
  let file = pattern || '{prompt}-{id}-{date}_{time}';
  for (const k in map) file = file.split(k).join(map[k]);
  file = sanitize(file) || 'sora-video';
  if (!/\.mp4$/i.test(file)) file += '.mp4';
  return file;
}

function enrichMeta(meta, soraUrl, raw) {
  const m = Object.assign({}, meta || {});
  const tryKeys = (obj, keys) => { for (const k of keys) if (typeof obj?.[k] === 'string' && obj[k].trim()) return obj[k].trim(); return null; };
  const id = m.id || tryKeys(raw, ['id','videoId','slug']) || tryKeys(raw?.data||{}, ['id','videoId','slug']);
  const prompt = m.prompt || tryKeys(raw, ['prompt','text','title']) || tryKeys(raw?.data||{}, ['prompt','text','title']);
  if (id) m.id = id;
  if (prompt) m.prompt = prompt;
  if (!m.id) { try { const u = new URL(soraUrl); m.id = (u.pathname.split('/').filter(Boolean).pop() || '').slice(0,32); } catch {} }
  return m;
}

async function startDownload(url, filename) {
  await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
}

function notify(title, message) {
  try { chrome.notifications.create('', { type: 'basic', iconUrl: 'icons/icon128.png', title, message: String(message || '') }); }
  catch (_) { console.log(title, message); }
}
