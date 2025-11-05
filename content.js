
// content.js - enhanced Sora UI detector with prompt/ID extraction
(function(){
  const BTN_CLASS = 'sora-helper-btn';
  const WRAP_CLASS = 'sora-helper-wrap';

  const style = document.createElement('style');
  style.textContent = `
    .${BTN_CLASS}{
      position:absolute; z-index:2147483647; right:52px; top:4px;
      width:40px; height:40px; display:flex; align-items:center; justify-content:center;
      background:#14b8a6; color:#fff; border:none; border-radius:10px; cursor:pointer;
      box-shadow: 0 10px 20px rgba(0,0,0,0.25); transition: all 0.2s ease-in-out;
    }
    .${BTN_CLASS}:hover{ background:#0ea5a3; }
    .${BTN_CLASS}:active{ transform: scale(0.9); }
    .${BTN_CLASS}[disabled]{ background:#9ca3af; cursor:not-allowed; }
    .${BTN_CLASS} svg{ width:20px; height:20px; }
    .${BTN_CLASS} .icon-loading{ display:none; }
    .${BTN_CLASS} .icon-check{ display:none; }
    .${BTN_CLASS}.is-loading .icon-download{ display:none; }
    .${BTN_CLASS}.is-loading .icon-loading{ display:block; animation:spin 0.6s linear infinite; }
    .${BTN_CLASS}.is-done .icon-download{ display:none; }
    .${BTN_CLASS}.is-done .icon-check{ display:block; }
    @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
    .${WRAP_CLASS}{ position:relative; display:inline-block; }
  `;
  document.documentElement.appendChild(style);

  function guessSoraShareUrl() {
    // Use current URL if domain hints at Sora/OpenAI pages
    try {
      const u = new URL(location.href);
      if (/sora|openai/i.test(u.hostname) || /\/sora\//i.test(u.pathname)) return u.toString();
    } catch {}
    // Scan for <a> that looks like share
    const as = Array.from(document.querySelectorAll('a[href]'));
    const like = as.find(a => /sora/i.test(a.href) && /share|copy|video|watch/i.test(a.textContent));
    return like ? like.href : location.href;
  }

  function nearestText(el, maxDepth=6) {
    let cur = el, depth = 0;
    while (cur && depth < maxDepth) {
      const txt = cur.textContent.trim();
      if (txt && txt.length > 10) return txt;
      cur = cur.parentElement;
      depth++;
    }
    return '';
  }

  function extractContextFor(videoEl) {
    const ctx = { prompt: '', id: '' };
    // 1) Try attributes on video or container
    const container = videoEl.closest('[data-id],[data-video-id],[data-prompt],[id]') || videoEl.parentElement;
    const attrs = ['data-id','data-video-id','data-videoid','id','data-key'];
    for (const k of attrs) if (container?.getAttribute?.(k)) { ctx.id = container.getAttribute(k); break; }
    const pAttrs = ['data-prompt','data-title','aria-label','title'];
    for (const k of pAttrs) if (container?.getAttribute?.(k)) { ctx.prompt = container.getAttribute(k); break; }

    // 2) Look for labelled 'Prompt:' nearby
    if (!ctx.prompt) {
      const near = container || videoEl;
      const promptNode = Array.from((near.closest('*')||document).querySelectorAll('*'))
        .slice(0,300)
        .find(n => /prompt\s*:|description|caption|tiêu đề|đề bài/i.test(n.textContent||''));
      if (promptNode) {
        const s = promptNode.textContent.replace(/^\s*(prompt\s*:?\s*)/i,'').trim();
        if (s.length > 0) ctx.prompt = s.slice(0,200);
      }
    }

    // 3) Fallback: long text around video
    if (!ctx.prompt) {
      const t = nearestText(videoEl);
      if (t) ctx.prompt = t.slice(0,200);
    }

    // 4) Clean up
    ctx.prompt = (ctx.prompt || '').replace(/\s+/g,' ').trim();
    ctx.id = (ctx.id || '').trim();
    return ctx;
  }

  function attachButtons() {
    document.querySelectorAll('video').forEach(v => {
      const already = v.closest(`.${WRAP_CLASS}`);
      if (already && already.querySelector(`.${BTN_CLASS}`)) return;
      const wrap = already || document.createElement('div');
      if (!already) {
        v.parentNode && v.parentNode.insertBefore(wrap, v);
        wrap.appendChild(v);
        wrap.className = WRAP_CLASS;
      }
      const btn = document.createElement('button');
      btn.className = BTN_CLASS;
      btn.setAttribute('title','Tải xuống');
      btn.innerHTML = `
        <svg class="icon-download" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        <svg class="icon-loading" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.75v1.5M12 17.75v1.5M17.75 12h1.5M4.75 12h1.5m11.54-5.54l-1.06 1.06M6.96 17.04l-1.06 1.06M17.04 6.96l-1.06 1.06M6.96 6.96l-1.06-1.06" />
        </svg>
        <svg class="icon-check" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      `;
      wrap.appendChild(btn);

      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.remove('is-done');
        btn.classList.add('is-loading');
        const pageUrl = guessSoraShareUrl();
        const meta = extractContextFor(v);
        chrome.runtime.sendMessage({
          type: 'FETCH_DOWNLOAD',
          soraUrl: pageUrl,
          autoDownload: true,
          meta
        }, resp => {
          if (!resp?.ok) {
            alert('Lỗi tải: ' + (resp?.error || 'không rõ'));
            btn.classList.remove('is-loading');
            btn.disabled = false;
            return;
          }
          btn.classList.remove('is-loading');
          btn.classList.add('is-done');
          setTimeout(() => { btn.disabled = false; btn.classList.remove('is-done'); }, 1600);
        });
      });
    });
  }

  attachButtons();
  const mo = new MutationObserver(attachButtons);
  mo.observe(document.documentElement, { subtree:true, childList:true });
})();
