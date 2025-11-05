
// popup.js with debug panel
const $ = (q) => document.querySelector(q);
const input = $('#input');
const statusEl = $('#status');
// auto toggle removed; always auto-download
const methodSel = document.querySelector('#method');

// no chips needed

function setStatus(t){ statusEl.textContent = t; }

async function loadOpts() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_OPTS' }).catch(()=>({ ok:false }));
  if (resp?.ok) {
    const o = resp.opts;
    // no auto toggle in UI
    // other options removed from UI
    if (methodSel) methodSel.value = o.preferredMethod || 'auto';
  }
}

// persist method selection
if (methodSel) {
  methodSel.addEventListener('change', async () => {
    const opts = { preferredMethod: methodSel.value };
    await chrome.runtime.sendMessage({ type: 'SAVE_OPTS', opts }).catch(()=>({ ok:false }));
  });
}

$('#paste').addEventListener('click', async () => {
  const text = await navigator.clipboard.readText().catch(()=>''); 
  if (text) input.value = text.trim();
});

$('#useTab').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab?.url) input.value = tab.url;
});

async function showDebug() {
  const d = await chrome.runtime.sendMessage({ type: 'GET_DEBUG_LAST' }).catch(()=>({ ok:false }));
  if (!d?.ok) return;
  const pre = document.createElement('pre');
  pre.className = 'muted';
  pre.style.maxHeight = '200px';
  pre.style.overflow = 'auto';
  pre.textContent = JSON.stringify(d.debug, null, 2).slice(0, 5000);
  statusEl.insertAdjacentElement('afterend', pre);
}

$('#go').addEventListener('click', async () => {
  const soraUrl = (input.value || '').trim();
  if (!soraUrl) return setStatus('Vui lòng nhập URL.');
  const goBtn = document.getElementById('go');
  goBtn.disabled = true; goBtn.classList.remove('is-done'); goBtn.classList.add('is-loading');

  // Direct proxy-download link case
  if (/^https?:\/\/savesora\.com\/api\/proxy-download/.test(soraUrl)) {
    setStatus('Đang tải trực tiếp từ proxy-download...');
    const resp = await chrome.runtime.sendMessage({
      type: 'DIRECT_DOWNLOAD',
      url: soraUrl,
      meta: {},
    }).catch(e => ({ ok:false, error: e.message }));
    if (resp?.ok) setStatus('✔️ Đã bắt đầu tải xuống.');
    else { setStatus('Lỗi: ' + (resp?.error || 'Không xác định')); await showDebug(); }
    return;
  }

  // Try to scrape some meta from active tab
  let meta = {};
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (tab?.id) {
      meta = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const v = document.querySelector('video');
          const nearestText = (el, maxDepth=6) => {
            let cur = el, depth = 0;
            while (cur && depth < maxDepth) {
              const txt = (cur.textContent||'').trim();
              if (txt && txt.length > 10) return txt;
              cur = cur.parentElement; depth++;
            }
            return '';
          };
          const extract = () => {
            const out = { prompt:'', id:'' };
            const cont = v?.closest('[data-id],[data-video-id],[data-prompt],[id]') || v?.parentElement || document.body;
            const a = ['data-id','data-video-id','data-videoid','id','data-key'];
            for (const k of a) if (cont?.getAttribute?.(k)) { out.id = cont.getAttribute(k); break; }
            const pa = ['data-prompt','data-title','aria-label','title'];
            for (const k of pa) if (cont?.getAttribute?.(k)) { out.prompt = cont.getAttribute(k); break; }
            if (!out.prompt) out.prompt = nearestText(v || document.body).slice(0,200);
            return out;
          };
          return extract();
        }
      }).then(res => res?.[0]?.result || {}).catch(()=>({}));
    }
  } catch {}

  setStatus('Đang gọi API...');
  const resp = await chrome.runtime.sendMessage({
    type: 'FETCH_DOWNLOAD',
    soraUrl,
    autoDownload: true,
    meta,
    preferredMethod: (methodSel && methodSel.value) || 'auto'
  }).catch(e => ({ ok:false, error: e.message }));

  if (!resp?.ok) {
    setStatus('Lỗi: ' + (resp?.error || 'Không xác định') + '\nMở debug ngay dưới.');
    await showDebug();
    goBtn.classList.remove('is-loading'); goBtn.disabled = false;
    return;
  }
  const a = document.createElement('a');
  a.href = resp.url;
  a.textContent = 'Mở link tải (proxy-download)';
  a.target = '_blank';
  a.className = 'link';
  setStatus(`✔️ Tìm thấy link tải:\n${resp.filename}\n`);
  statusEl.appendChild(a);
  goBtn.classList.remove('is-loading'); goBtn.classList.add('is-done');
  setTimeout(()=> { goBtn.classList.remove('is-done'); goBtn.disabled = false; }, 1200);
});

// Chips to append tokens
// removed chips UI


// Open dedicated window that won't auto-close (removed)


loadOpts();

// set dynamic version from manifest
try {
  const v = chrome.runtime.getManifest && chrome.runtime.getManifest().version;
  const verEl = document.getElementById('appVersion');
  if (v && verEl) verEl.textContent = v;
} catch {}
