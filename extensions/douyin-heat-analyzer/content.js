// Douyin Heat Analyzer - Content Script
// Scans Douyin pages, extracts interaction data, computes heat in background, and annotates UI.

(function() {
  const DEBUG = false;
  function log(...args){ if(DEBUG) console.log('[DouyinHeat]', ...args); }

  const seen = new Set();

  function parseCount(input) {
    if (typeof input === 'number') return input;
    if (!input) return 0;
    let s = String(input).trim();
    s = s.replace(/[,\s]/g, '');
    const lower = s.toLowerCase();
    let multiplier = 1;
    if (/亿/.test(s)) multiplier = 1e8;
    else if (/万|w/.test(lower)) multiplier = 1e4;
    else if (/k/.test(lower)) multiplier = 1e3;
    else if (/m/.test(lower)) multiplier = 1e6;
    const match = s.match(/([0-9]+(?:\.[0-9]+)?)/);
    const num = match ? parseFloat(match[1]) : 0;
    return Math.round(num * multiplier);
  }

  function getVideoIdFromUrl(u){
    try {
      const url = new URL(u, location.href);
      const m = url.pathname.match(/\/video\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch(e) { return null; }
  }

  function closestCard(el){
    return el.closest('[data-e2e], li, article, section, .video-card, ._douyin_card, .B9t,.i9n, .i9o, div');
  }

  function findTextWithin(el, selectors){
    for (const sel of selectors){
      const target = el.querySelector(sel);
      if (!target) continue;
      const txt = (target.getAttribute('title')||target.getAttribute('aria-label')||target.textContent||'').trim();
      if (txt) return { el: target, text: txt };
    }
    return null;
  }

  function findNumberNearby(root, hintSelector){
    if (!root) return null;
    const hint = root.querySelector(hintSelector);
    if (!hint) return null;
    // Search siblings or within same container for a number-looking text
    const container = hint.closest('div,li,section,article') || root;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let best = null; let maxLen = 0;
    while (walker.nextNode()){
      const s = walker.currentNode.textContent.trim();
      if (/^[0-9.,wW万亿kKmM]+$/.test(s)){
        if (s.length > maxLen){ best = s; maxLen = s.length; }
      }
    }
    return best;
  }

  function extractCounts(card){
    const likeSel = [
      '[data-e2e*="like"]','[data-e2e*="digg"]','[data-e2e*="like-count"]','[class*="like"]','[aria-label*="赞"]','[title*="赞"]'
    ];
    const commentSel = [
      '[data-e2e*="comment"]','[class*="comment"]','[aria-label*="评论"]','[title*="评论"]'
    ];
    const shareSel = [
      '[data-e2e*="share"]','[class*="share"]','[aria-label*="分享"],[title*="分享"]','[aria-label*="转发"],[title*="转发"]'
    ];
    const collectSel = [
      '[data-e2e*="collect"]','[class*="collect"]','[aria-label*="收藏"],[title*="收藏"]'
    ];
    const playSel = [
      '[data-e2e*="play"]','[class*="play"]','[aria-label*="播放"],[title*="播放"]'
    ];

    const findCount = (sels) => {
      for (const sel of sels){
        const n = card.querySelector(sel);
        if (n){
          // Prefer direct numeric text
          const t = (n.textContent||'').trim() || n.getAttribute('aria-label') || n.getAttribute('title') || '';
          if (/\d/.test(t) || /[万w亿kKmM]/.test(t)) return parseCount(t);
          // Otherwise, look nearby
          const near = findNumberNearby(card, sel);
          if (near) return parseCount(near);
        }
      }
      return 0;
    };

    return {
      likes: findCount(likeSel),
      comments: findCount(commentSel),
      shares: findCount(shareSel),
      collects: findCount(collectSel),
      plays: findCount(playSel),
    };
  }

  function extractMeta(card){
    // Title / description
    let title = '';
    let titleEl = card.querySelector('[data-e2e*="desc"], [data-e2e*="title"], h1, h2, .title, .desc, [class*="desc"], [class*="title"], figcaption');
    if (titleEl) title = (titleEl.textContent||'').trim();

    // Author
    let author = '';
    let authorEl = card.querySelector('[data-e2e*="author"], [href*="/user/"], [class*="author"], [rel*="author"]');
    if (authorEl) author = (authorEl.textContent||authorEl.getAttribute('title')||'').trim();

    // Hashtags
    const hashtags = Array.from(card.querySelectorAll('a[href*="#"], a[href*="/challenge/"], [class*="tag"]'))
      .map(a => (a.textContent||'').trim())
      .filter(Boolean)
      .slice(0, 8);

    // Publish time (relative)
    let publishTime = '';
    const timeEl = card.querySelector('time, [data-e2e*="time"], [class*="time"], [aria-label*="前"], [title*="前"]');
    if (timeEl) publishTime = (timeEl.getAttribute('datetime') || timeEl.getAttribute('title') || timeEl.getAttribute('aria-label') || timeEl.textContent || '').trim();

    // Duration
    let duration = '';
    const durEl = card.querySelector('[data-e2e*="duration"], [class*="duration"], time[datetime*="PT"]');
    if (durEl) duration = (durEl.textContent||'').trim();

    // Cover image
    let cover = '';
    const img = card.querySelector('img');
    if (img) cover = img.src || img.getAttribute('data-src') || '';

    return { title, author, hashtags, publishTime, duration, cover };
  }

  function annotate(card, score){
    if (card.querySelector('.dy-heat-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'dy-heat-badge';
    badge.textContent = `热度: ${score}`;
    Object.assign(badge.style, {
      position: 'absolute',
      top: '6px',
      right: '6px',
      background: 'linear-gradient(135deg,#ff416c,#ff4b2b)',
      color: '#fff',
      fontSize: '12px',
      fontWeight: '600',
      padding: '4px 6px',
      borderRadius: '6px',
      zIndex: 2147483647,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });
    const root = card.style ? card : (card.parentElement || document.body);
    if (root && root.style && getComputedStyle(root).position === 'static') {
      root.style.position = 'relative';
    }
    (root || document.body).appendChild(badge);
  }

  async function computeHeat(localItem){
    const { settings } = await chrome.runtime.sendMessage({ type: 'getSettings' });
    // Ask background to compute in a consistent way by storing and retrieving score
    const tmpId = localItem.videoId || Math.random().toString(36).slice(2);
    await chrome.runtime.sendMessage({ type: 'addVideoData', data: localItem });
    const { list } = await chrome.runtime.sendMessage({ type: 'getAllData' });
    const found = list.find(x => x.videoId === tmpId) || list.find(x => x.link === localItem.link);
    return found ? found.heat : 0;
  }

  async function handleCardLink(a){
    const href = a.getAttribute('href') || '';
    const videoId = getVideoIdFromUrl(href);
    if (!videoId) return;
    if (seen.has(videoId)) return;

    const card = closestCard(a) || a;
    const counts = extractCounts(card);
    const meta = extractMeta(card);

    const data = {
      videoId,
      link: new URL(href, location.href).toString(),
      ...counts,
      ...meta,
      collectedAt: Date.now(),
      source: location.href
    };

    try {
      await chrome.runtime.sendMessage({ type: 'addVideoData', data });
      const { list } = await chrome.runtime.sendMessage({ type: 'getAllData' });
      const it = (list || []).find(x => x.videoId === videoId);
      if (it && typeof it.heat === 'number') annotate(card, it.heat);
      seen.add(videoId);
    } catch (e) {
      log('Failed to send data', e);
    }
  }

  function scan(){
    const anchors = document.querySelectorAll('a[href*="/video/"]');
    anchors.forEach(a => handleCardLink(a));
  }

  const obs = new MutationObserver((muts) => {
    let shouldScan = false;
    for (const m of muts){
      if (m.addedNodes && m.addedNodes.length){ shouldScan = true; break; }
    }
    if (shouldScan) scan();
  });

  function init(){
    scan();
    obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // Rescan periodically to catch lazy content
    setInterval(scan, 4000);
  }

  chrome.runtime.sendMessage({ type: 'getSettings' }).then(({ settings }) => {
    if (settings?.autoCollectEnabled !== false) init();
  });

  // Listen for manual rescan from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'scanNow') scan();
  });
})();
