// ==UserScript==
// @name         Reptyle Stash Model Link
// @namespace    local.reptyle-stash-model-link
// @version      8.0.1
// @description  Shows the Stash performer match on model pages of supported sites (one adapter per site, Reptyle first), with an add-URL button and Stash link, and marks models and videos already in Stash on listings.
// @match        https://app.reptyle.com/*
// @updateURL    https://raw.githubusercontent.com/Morrison65/reptyle-stash-model-link/master/reptyle-stash-model-link.user.js
// @downloadURL  https://raw.githubusercontent.com/Morrison65/reptyle-stash-model-link/master/reptyle-stash-model-link.user.js
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @noframes
// ==/UserScript==

/* global module:readonly */

(function () {
  'use strict';
  const VERSION = '8.0.1';
  // One adapter per site or network: everything page-specific lives here, the core below is generic.
  // hosts: page hosts the adapter runs on (each needs an @match). detail/listing: model page paths.
  // sceneHosts: hosts whose URLs Stash stores for this site's scenes; sceneKey/modelKey reduce a URL to the id both sides share.
  var SITES = [{
    id: 'reptyle',
    hosts: ['app.reptyle.com'],
    detail: /^\/models\/\d+/,
    listing: /^\/models\/?$/,
    headingSel: '.model-name-container h2',
    anchorSel: '.model-name-container',
    headingFallbackSel: 'h2',
    nameSkip: /featured in/i,
    titleSep: '|',
    videoCardSel: '.movies-thumb-entry',
    videoLinkSel: 'a[href*="/movies/"]',
    modelLinkSel: 'a[href*="/models/"]',
    modelCardSel: '.ant-card',
    modelEntrySel: '.models-grid-entry',
    modelNameSel: '.ant-card-meta-description span',
    sceneHosts: ['app.reptyle.com'],
    sceneKey: extractMovieId,
    modelKey: extractModelId,
    modelUrl: function (origin, key) { return origin + '/models/' + key; }
  }];
  // Node unit tests load the pure helpers only (function declarations are hoisted); nothing else touches the page.
  if (typeof module === 'object' && module.exports) {
    module.exports = { VERSION: VERSION, SITES: SITES, siteFor: siteFor, normUrl: normUrl, normTitle: normTitle, normName: normName, extractMovieId: extractMovieId, extractModelId: extractModelId };
    return;
  }
  var site = siteFor(location.hostname);
  if (!site) return;
  var STASH_ORIGIN = 'http://localhost:9999';
  var ENDPOINT = STASH_ORIGIN + '/graphql';
  var PANEL_ID = 'stash-model-link-panel';
  var HEADING_BADGE_ID = 'stash-model-link-heading-badge';
  var VIDEO_BADGE_CLASS = 'stash-model-link-video-badge';
  var MODEL_BADGE_CLASS = 'stash-model-link-model-badge';
  var MODEL_ADD_CLASS = 'stash-model-link-model-add';
  var lastPath = '';
  var headingOrigColor = '';
  var sceneMapCache = null;
  var performerTitleMapCache = null;
  var performerTitleMapFor = null;
  var performerFound = false;
  var performerMapCache = null;
  var performerMapPromise = null;
  function siteFor(host) { host = String(host || '').toLowerCase(); for (var i = 0; i < SITES.length; i++) { for (var j = 0; j < SITES[i].hosts.length; j++) { var h = SITES[i].hosts[j]; if (host === h || host.slice(-h.length - 1) === '.' + h) return SITES[i]; } } return null; }
  function getPageUrl() { return location.origin + location.pathname; }
  function headingEl() { return document.querySelector(site.headingSel) || document.querySelector(site.headingFallbackSel); }
  function headingText(h) { var c = h.cloneNode(true); var b = c.querySelector('#' + HEADING_BADGE_ID); if (b) b.remove(); return (c.textContent || '').trim(); }
  function getModelName() {
    var h = document.querySelector(site.headingSel);
    if (h && headingText(h)) return headingText(h);
    var hs = Array.prototype.slice.call(document.querySelectorAll(site.headingFallbackSel));
    for (var i = 0; i < hs.length; i++) {
      var t = (hs[i].innerText || '').trim();
      if (t && !(site.nameSkip && site.nameSkip.test(t)) && t.length < 80) return t;
    }
    var parts = document.title.split(site.titleSep);
    if (parts.length > 1 && parts[1].trim()) return parts[1].trim();
    return document.title.trim() || '';
  }
  function normUrl(u) { return String(u || '').trim().replace(/\/+$/, ''); }
  function gql(query, variables) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: ENDPOINT,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ query: query, variables: variables || {} }),
        timeout: 15000,
        onload: function (r) {
          if (r.status < 200 || r.status >= 300) { reject(new Error('Stash HTTP ' + r.status)); return; }
          var j;
          try { j = JSON.parse(r.responseText); } catch (e) { reject(e); return; }
          if (j.errors && j.errors.length) { reject(new Error(j.errors[0].message || 'GraphQL error')); return; }
          resolve(j.data);
        },
        onerror: function () { reject(new Error('network error')); },
        ontimeout: function () { reject(new Error('timeout')); }
      });
    });
  }
  // The only write the script makes; always asks first.
  function addPerformerUrl(p, url) {
    if (!confirm('Add this URL to "' + p.name + '" (Stash id ' + p.id + ')?\n\n' + url)) return Promise.resolve(null);
    var next = (p.urls || []).slice();
    next.push(url);
    return gql('mutation($input:PerformerUpdateInput!){ performerUpdate(input:$input){ id urls } }', { input: { id: p.id, urls: next } }).then(function () { return next; });
  }
  function resetHeading() { var h = headingEl(); if (!h) return; var b = document.getElementById(HEADING_BADGE_ID); if (b) b.remove(); if (headingOrigColor) h.style.color = headingOrigColor; else h.style.color = ''; h.style.fontWeight = ''; }
  function highlightHeading() { var h = headingEl(); if (!h) return; if (!headingOrigColor && !h.style.color) headingOrigColor = getComputedStyle(h).color; h.style.color = '#22c55e'; h.style.fontWeight = '700'; if (!document.getElementById(HEADING_BADGE_ID)) { var b = document.createElement('span'); b.id = HEADING_BADGE_ID; b.textContent = ' ☑'; b.style.cssText = 'color:#22c55e;font-weight:800;margin-left:6px;'; h.appendChild(b); } }
  function extractMovieId(href) { var m = String(href || '').match(/\/movies\/(\d+)/); return m ? m[1] : null; }
  function clearVideoMarks() { var els = document.querySelectorAll('.' + VIDEO_BADGE_CLASS); for (var ci = 0; ci < els.length; ci++) els[ci].remove(); var marked = document.querySelectorAll('[data-sml-video-green="1"]'); for (var cj = 0; cj < marked.length; cj++) { var m = marked[cj]; var chk = m.querySelector('[data-sml-video-check]'); if (chk) chk.remove(); m.style.color = ''; m.style.fontWeight = ''; m.removeAttribute('data-sml-video-green'); m.removeAttribute('title'); } }
  function normTitle(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[‘’“”]/g, "'").replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function cardTitleForCard(card) { var links = card.querySelectorAll(site.videoLinkSel); for (var ti = 0; ti < links.length; ti++) { var t = (links[ti].innerText || '').trim(); if (t) return t; } return ''; }
  function matchSceneForCard(card, urlMap, titleMap) { var a = card.querySelector(site.videoLinkSel); if (!a) return null; var id = site.sceneKey(a.getAttribute('href') || a.href); if (id && urlMap && urlMap[id]) return urlMap[id]; if (titleMap) { var nt = normTitle(cardTitleForCard(card)); if (nt && titleMap[nt]) return titleMap[nt]; } return null; }
  function fetchScenesForHost(host) { return (function next(page, acc) { return gql('query($h:String!,$p:Int!){ findScenes(scene_filter:{url:{value:$h, modifier:INCLUDES}}, filter:{per_page:500, page:$p}){ scenes{ id title urls } } }', { h: host, p: page }).then(function (data) { var ss = (data && data.findScenes && data.findScenes.scenes) || []; var all = acc.concat(ss); return (ss.length < 500 || page >= 20) ? all : next(page + 1, all); }); })(1, []); }
  function fetchSceneMap() { return Promise.all(site.sceneHosts.map(fetchScenesForHost)).then(function (lists) { var map = {}; for (var l = 0; l < lists.length; l++) { var scenes = lists[l]; for (var i = 0; i < scenes.length; i++) { var s = scenes[i]; for (var j = 0; j < ((s.urls) || []).length; j++) { var id = site.sceneKey(s.urls[j]); if (id && !map[id]) map[id] = s; } } } sceneMapCache = map; return map; }); }
  function fetchPerformerTitleMap(pid) { if (performerTitleMapCache && performerTitleMapFor === String(pid)) return Promise.resolve(performerTitleMapCache); var num = parseInt(pid, 10); return gql('query{ findScenes(scene_filter:{performers:{value:[' + num + '], modifier:INCLUDES}}, filter:{per_page:200}){ count scenes{ id title urls } } }').then(function (data) { var map = {}; var scenes = ((data && data.findScenes && data.findScenes.scenes) || []); for (var i = 0; i < scenes.length; i++) { var k = normTitle(scenes[i].title); if (k && !map[k]) map[k] = scenes[i]; } performerTitleMapCache = map; performerTitleMapFor = String(pid); return map; }); }
  function titleLinkForCard(card) { var links = card.querySelectorAll(site.videoLinkSel); for (var li = 0; li < links.length; li++) { if ((links[li].innerText || '').trim()) return links[li]; } return null; }
  function styleVideoTitle(card, hit) { var link = titleLinkForCard(card); if (!link) return; var t = link.querySelector('span') || link; if (t.getAttribute && t.getAttribute('data-sml-video-green') === '1') return; t.style.color = '#22c55e'; t.style.fontWeight = '700'; t.setAttribute('data-sml-video-green', '1'); try { t.title = (hit.title || '') + ' (Stash id ' + hit.id + ')'; } catch (e) {} var chk = document.createElement('span'); chk.setAttribute('data-sml-video-check', '1'); chk.textContent = '✓ '; chk.style.cssText = 'color:#22c55e;font-weight:800;'; try { t.insertBefore(chk, t.firstChild); } catch (e2) {} }
  function markVideos(urlMap, titleMap) { var um = urlMap || sceneMapCache || {}; var tm = (typeof titleMap === 'undefined') ? performerTitleMapCache : titleMap; var cards = document.querySelectorAll(site.videoCardSel); for (var i = 0; i < cards.length; i++) { var card = cards[i]; var hit = matchSceneForCard(card, um, tm); if (!hit) continue; if (!card.querySelector('.' + VIDEO_BADGE_CLASS)) { try { if (getComputedStyle(card).position === 'static') card.style.position = 'relative'; } catch (e) {} var b = document.createElement('a'); b.className = VIDEO_BADGE_CLASS; b.textContent = '✓ IN STASH'; b.href = STASH_ORIGIN + '/scenes/' + hit.id; b.target = '_blank'; b.rel = 'noopener'; b.title = (hit.title || '') + ' (Stash id ' + hit.id + ')'; b.style.cssText = 'position:absolute;top:6px;left:6px;z-index:5;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.4);'; card.appendChild(b); } try { styleVideoTitle(card, hit); } catch (e2) {} } }
  function extractModelId(href) { var m = String(href || '').match(/\/models\/(\d+)/); return m ? m[1] : null; }
  function modelCardForLink(a) { try { var card = a.closest(site.modelCardSel); if (card) return card; } catch (e) {} var el = a; for (var mi = 0; mi < 4 && el; mi++) { el = el.parentElement; if (el && el.matches && el.matches(site.modelEntrySel)) return el; } return a.parentElement || a; }
  function modelNameEl(card) { return card.querySelector(site.modelNameSel) || card.querySelector('span'); }
  function modelNameForLink(a, card) { var s = modelNameEl(card); if (s && s.textContent.trim()) return s.textContent.trim(); var t = (a.innerText || '').trim(); if (t && t.length < 80) return t; return ''; }
  function normName(s) { return String(s || '').toLowerCase().trim(); }
  function performerNames(p) { return [p.name].concat(p.alias_list || []); }
  function fetchPerformerMap() { if (performerMapCache) return Promise.resolve(performerMapCache); if (performerMapPromise) return performerMapPromise; performerMapPromise = (function next(page, acc) { return gql('query($p:Int!){ findPerformers(filter:{per_page:500, page:$p}){ count performers{ id name alias_list urls } } }', { p: page }).then(function (data) { var ps = (data && data.findPerformers && data.findPerformers.performers) || []; var all = acc.concat(ps); if (ps.length < 500 || page >= 10) { var map = {}; for (var i = 0; i < all.length; i++) { var k = normName(all[i].name); if (k && !map[k]) map[k] = all[i]; } for (var ai = 0; ai < all.length; ai++) { var al = all[ai].alias_list || []; for (var aj = 0; aj < al.length; aj++) { var ak = normName(al[aj]); if (ak && !map[ak]) map[ak] = all[ai]; } } performerMapCache = map; return map; } return next(page + 1, all); }); })(1, []); return performerMapPromise; }
  function clearModelMarks() { var els = document.querySelectorAll('.' + MODEL_BADGE_CLASS + ', .' + MODEL_ADD_CLASS); for (var ci2 = 0; ci2 < els.length; ci2++) els[ci2].remove(); var names = document.querySelectorAll('[data-sml-name-green="1"]'); for (var cj = 0; cj < names.length; cj++) { names[cj].style.color = ''; names[cj].style.fontWeight = ''; names[cj].removeAttribute('data-sml-name-green'); } }
  // The handlers below only read pageUrl synchronously and performerMapCache at click time (the shared cache), so the loop closures are safe.
  // eslint-disable-next-line no-loop-func
  function markModelCards(map) { var links = document.querySelectorAll(site.modelLinkSel); for (var i = 0; i < links.length; i++) { var a = links[i]; var href = a.getAttribute('href') || a.href || ''; var rid = site.modelKey(href); if (!rid) continue; var card = modelCardForLink(a); if (!card || card.querySelector(':scope > .' + MODEL_BADGE_CLASS)) continue; var name = modelNameForLink(a, card); if (!name) continue; var hit = map[normName(name)]; if (!hit) continue; try { if (getComputedStyle(card).position === 'static') card.style.position = 'relative'; } catch (e) {} var pageUrl = site.modelUrl(location.origin, rid); var hasUrl = (hit.urls || []).some(function (u) { return normUrl(u).toLowerCase() === normUrl(pageUrl).toLowerCase(); }); var b = document.createElement('a'); b.className = MODEL_BADGE_CLASS; b.textContent = '✓ IN STASH'; b.href = STASH_ORIGIN + '/performers/' + hit.id; b.target = '_blank'; b.rel = 'noopener'; b.title = hit.name + ' (Stash id ' + hit.id + ')'; b.style.cssText = 'position:absolute;top:6px;left:6px;z-index:5;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.4);'; b.addEventListener('click', function (ev) { ev.stopPropagation(); }); card.appendChild(b); var ns = modelNameEl(card); if (ns && !ns.getAttribute('data-sml-name-green')) { ns.style.color = '#22c55e'; ns.style.fontWeight = '700'; ns.setAttribute('data-sml-name-green', '1'); } if (!hasUrl && !card.querySelector(':scope > .' + MODEL_ADD_CLASS)) { (function (h, url, c2) { var add = document.createElement('button'); add.className = MODEL_ADD_CLASS; add.textContent = '+ URL'; add.title = 'Save ' + url + ' on ' + h.name + ' in Stash'; add.style.cssText = 'position:absolute;top:6px;right:6px;z-index:5;background:#b45309;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;border:none;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4);'; add.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); add.disabled = true; add.textContent = '...'; addPerformerUrl(h, url).then(function (nxt) { if (!nxt) { add.disabled = false; add.textContent = '+ URL'; return; } add.remove(); h.urls = nxt; }).catch(function (err) { add.disabled = false; add.textContent = '+ URL'; alert('Stash update failed: ' + err.message); }); }); c2.appendChild(add); })(hit, pageUrl, card); } } }
  function runListing(force) { if (!force && location.pathname === lastPath && performerMapCache) { try { markModelCards(performerMapCache); } catch (e) {} return; } lastPath = location.pathname; removePanel(); resetHeading(); clearVideoMarks(); performerFound = false; fetchPerformerMap().then(function (map) { markModelCards(map); }).catch(function () {}); }
  function findAnchor() { return document.querySelector(site.anchorSel) || document.querySelector(site.headingFallbackSel); }
  function removePanel() { var old = document.getElementById(PANEL_ID); if (old) old.remove(); }
  function stylePanel(el) { el.style.cssText = 'margin:10px 0;padding:10px 12px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;font-size:13px;line-height:1.55;max-width:680px;font-family:system-ui,sans-serif;'; }
  function renderLoading(anchor, name) {
    removePanel();
    resetHeading();
    clearVideoMarks();
    performerFound = false;
    sceneMapCache = null;
    performerTitleMapCache = null;
    performerTitleMapFor = null;
    var div = document.createElement('div');
    div.id = PANEL_ID;
    stylePanel(div);
    div.textContent = 'STASH: looking up "' + name + '" ...';
    anchor.insertAdjacentElement('afterend', div);
  }
  function render(anchor, state) {
    removePanel();
    var div = document.createElement('div');
    div.id = PANEL_ID;
    stylePanel(div);
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;margin-bottom:4px;';
    title.textContent = 'STASH';
    div.appendChild(title);
    function line(text, color) { var p = document.createElement('div'); if (color) p.style.color = color; p.textContent = text; div.appendChild(p); return p; }
    if (state.error) {
      resetHeading();
      clearVideoMarks();
      performerFound = false;
      line('Cannot reach Stash at ' + STASH_ORIGIN + ': ' + state.error, '#fca5a5');
      var retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.style.cssText = 'margin-top:8px;padding:4px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;';
      retry.addEventListener('click', function () { run(true); });
      div.appendChild(retry);
      anchor.insertAdjacentElement('afterend', div);
      return;
    }
    if (!state.exact) {
      resetHeading();
      clearVideoMarks();
      performerFound = false;
      line('Model "' + state.name + '" NOT found in Stash (' + state.count + ' fuzzy hit(s)).', '#fcd34d');
      if (state.candidates.length) line('Closest: ' + state.candidates.map(function (p) { return p.name + ' (id ' + p.id + ')'; }).join(', '), '#94a3b8');
      anchor.insertAdjacentElement('afterend', div);
      return;
    }
    var p = state.exact;
    highlightHeading();
    var hasUrl = p.urls.some(function (u) { return normUrl(u).toLowerCase() === normUrl(state.pageUrl).toLowerCase(); });
    var foundLine = line('', null);
    var check = document.createElement('span');
    check.textContent = '✓ ';
    check.style.cssText = 'color:#22c55e;font-weight:800;';
    foundLine.appendChild(check);
    foundLine.appendChild(document.createTextNode('Found in Stash: '));
    var nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.cssText = 'color:#22c55e;font-weight:700;';
    foundLine.appendChild(nameSpan);
    foundLine.appendChild(document.createTextNode(' (id ' + p.id + ')'));
    line(hasUrl ? 'This page URL is saved on the performer.' : 'This page URL is NOT saved on the performer.', hasUrl ? '#94a3b8' : '#fcd34d');
    if (!hasUrl && p.urls.length) line('Saved URLs: ' + p.urls.join(', '), '#94a3b8');
    var row = document.createElement('div');
    row.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
    div.appendChild(row);
    var view = document.createElement('a');
    view.href = STASH_ORIGIN + '/performers/' + p.id;
    view.target = '_blank';
    view.rel = 'noopener';
    view.textContent = 'View in Stash';
    view.style.cssText = 'padding:4px 12px;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none;';
    row.appendChild(view);
    if (!hasUrl) {
      var btn = document.createElement('button');
      btn.textContent = 'Add this URL in Stash';
      btn.style.cssText = 'padding:4px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;cursor:pointer;';
      btn.addEventListener('click', function () {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        addPerformerUrl(p, state.pageUrl).then(function (next) { if (next) run(true); else { btn.disabled = false; btn.textContent = 'Add this URL in Stash'; } }).catch(function (e) { btn.disabled = false; btn.textContent = 'Add this URL in Stash'; alert('Stash update failed: ' + e.message); });
      });
      row.appendChild(btn);
    }
    var vidLine = line('', '#94a3b8');
    anchor.insertAdjacentElement('afterend', div);
    performerFound = true;
    Promise.all([fetchSceneMap(), fetchPerformerTitleMap(p.id)]).then(function (maps) { var urlMap = maps[0] || {}; var titleMap = maps[1] || {}; markVideos(urlMap, titleMap); var cards = document.querySelectorAll(site.videoCardSel); var total = 0, hit = 0; for (var k = 0; k < cards.length; k++) { var la = cards[k].querySelector(site.videoLinkSel); if (!la) continue; var mid = site.sceneKey(la.getAttribute('href') || la.href); if (!mid && !cardTitleForCard(cards[k])) continue; total++; if (matchSceneForCard(cards[k], urlMap, titleMap)) hit++; } vidLine.textContent = total ? ('Videos on this page in Stash: ' + hit + '/' + total) : 'No videos found on this page.'; vidLine.style.color = hit ? '#86efac' : '#94a3b8'; }).catch(function () { vidLine.textContent = 'Video check failed.'; });
  }
  function runDetail(force) {
    if (!site.detail.test(location.pathname)) { removePanel(); resetHeading(); clearVideoMarks(); performerFound = false; sceneMapCache = null; performerTitleMapCache = null; performerTitleMapFor = null; return; }
    if (!force && location.pathname === lastPath && document.getElementById(PANEL_ID)) return;
    lastPath = location.pathname;
    var anchor = findAnchor();
    if (!anchor) return;
    var name = getModelName();
    var pageUrl = getPageUrl();
    if (!name) return;
    renderLoading(anchor, name);
    gql('query($q:String!){ findPerformers(filter:{q:$q, per_page:10}){ count performers{ id name alias_list urls } } }', { q: name }).then(function (data) {
      var fp = (data && data.findPerformers) || { count: 0, performers: [] };
      var exact = null;
      // Names first, then aliases, so a performer called exactly this wins over one that only lists it as an alias.
      for (var i = 0; i < fp.performers.length && !exact; i++) { if (normName(fp.performers[i].name) === normName(name)) exact = fp.performers[i]; }
      for (var j = 0; j < fp.performers.length && !exact; j++) { if (performerNames(fp.performers[j]).some(function (n) { return normName(n) === normName(name); })) exact = fp.performers[j]; }
      var a2 = findAnchor();
      if (a2) render(a2, { name: name, pageUrl: pageUrl, count: fp.count, exact: exact, candidates: fp.performers.slice(0, 5) });
    }).catch(function (e) {
      var a3 = findAnchor();
      if (a3) render(a3, { name: name, pageUrl: pageUrl, error: e.message });
    });
  }
  function run(force) { if (site.detail.test(location.pathname)) return runDetail(force); if (site.listing.test(location.pathname)) return runListing(force); removePanel(); resetHeading(); clearVideoMarks(); clearModelMarks(); performerFound = false; sceneMapCache = null; performerTitleMapCache = null; performerTitleMapFor = null; }
  var tries = 0;
  var boot = setInterval(function () { tries++; if (findAnchor() || document.querySelector(site.modelEntrySel)) { clearInterval(boot); run(true); } else if (tries > 40) clearInterval(boot); }, 500);
  setInterval(function () { try { if (performerFound && (sceneMapCache || performerTitleMapCache)) markVideos(sceneMapCache, performerTitleMapCache); } catch (e) {} try { if (performerMapCache && site.listing.test(location.pathname)) markModelCards(performerMapCache); } catch (e2) {} run(false); }, 2000);
})();
