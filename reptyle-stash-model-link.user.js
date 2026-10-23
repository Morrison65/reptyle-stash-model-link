// ==UserScript==
// @name         Reptyle Stash Model Link
// @namespace    local.reptyle-stash-model-link
// @version      7.0.0
// @description  Shows the Stash performer match on Reptyle model pages, with an add-URL button and Stash link, and marks models and videos already in Stash on listings.
// @match        https://app.reptyle.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @noframes
// ==/UserScript==

/* global module:readonly */

(function () {
  'use strict';
  const VERSION = '7.0.0';
  // Node unit tests load the pure helpers only (function declarations are hoisted); nothing else touches the page.
  if (typeof module === 'object' && module.exports) {
    module.exports = { VERSION: VERSION, normUrl: normUrl, normTitle: normTitle, normName: normName, extractMovieId: extractMovieId, extractModelId: extractModelId };
    return;
  }
  var STASH_ORIGIN = 'http://localhost:9999';
  var ENDPOINT = STASH_ORIGIN + '/graphql';
  var PANEL_ID = 'reptyle-stash-panel';
  var HEADING_BADGE_ID = 'reptyle-stash-heading-badge';
  var VIDEO_BADGE_CLASS = 'reptyle-stash-video-badge';
  var MODEL_BADGE_CLASS = 'reptyle-stash-model-badge';
  var MODEL_ADD_CLASS = 'reptyle-stash-model-add';
  var lastPath = '';
  var headingOrigColor = '';
  var sceneMapCache = null;
  var performerTitleMapCache = null;
  var performerTitleMapFor = null;
  var performerFound = false;
  var performerMapCache = null;
  var performerMapPromise = null;
  function getPageUrl() { return location.origin + location.pathname; }
  function headingEl() { return document.querySelector('.model-name-container h2') || document.querySelector('h2'); }
  function headingText(h) { var c = h.cloneNode(true); var b = c.querySelector('#' + HEADING_BADGE_ID); if (b) b.remove(); return (c.textContent || '').trim(); }
  function getModelName() {
    var h = document.querySelector('.model-name-container h2');
    if (h && headingText(h)) return headingText(h);
    var h2s = Array.prototype.slice.call(document.querySelectorAll('h2'));
    for (var i = 0; i < h2s.length; i++) {
      var t = (h2s[i].innerText || '').trim();
      if (t && !/featured in/i.test(t) && t.length < 80) return t;
    }
    var parts = document.title.split('|');
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
  function resetHeading() { var h = headingEl(); if (!h) return; var b = document.getElementById(HEADING_BADGE_ID); if (b) b.remove(); if (headingOrigColor) h.style.color = headingOrigColor; else h.style.color = ''; h.style.fontWeight = ''; }
  function highlightHeading() { var h = headingEl(); if (!h) return; if (!headingOrigColor && !h.style.color) headingOrigColor = getComputedStyle(h).color; h.style.color = '#22c55e'; h.style.fontWeight = '700'; if (!document.getElementById(HEADING_BADGE_ID)) { var b = document.createElement('span'); b.id = HEADING_BADGE_ID; b.textContent = ' \u2611'; b.style.cssText = 'color:#22c55e;font-weight:800;margin-left:6px;'; h.appendChild(b); } }
  function extractMovieId(href) { var m = String(href || '').match(/\/movies\/(\d+)/); return m ? m[1] : null; }
  function clearVideoMarks() { var els = document.querySelectorAll('.' + VIDEO_BADGE_CLASS); for (var ci = 0; ci < els.length; ci++) els[ci].remove(); var marked = document.querySelectorAll('[data-rsl-video-green="1"]'); for (var cj = 0; cj < marked.length; cj++) { var m = marked[cj]; var chk = m.querySelector('[data-rsl-video-check]'); if (chk) chk.remove(); m.style.color = ''; m.style.fontWeight = ''; m.removeAttribute('data-rsl-video-green'); m.removeAttribute('title'); } }
  function normTitle(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function cardTitleForCard(card) { var links = card.querySelectorAll('a[href*="/movies/"]'); for (var ti = 0; ti < links.length; ti++) { var t = (links[ti].innerText || '').trim(); if (t) return t; } return ''; }
  function matchSceneForCard(card, urlMap, titleMap) { var a = card.querySelector('a[href*="/movies/"]'); if (!a) return null; var id = extractMovieId(a.getAttribute('href') || a.href); if (id && urlMap && urlMap[id]) return urlMap[id]; if (titleMap) { var nt = normTitle(cardTitleForCard(card)); if (nt && titleMap[nt]) return titleMap[nt]; } return null; }
  function fetchReptyleSceneMap() { return gql('query{ findScenes(scene_filter:{url:{value:"app.reptyle.com", modifier:INCLUDES}}, filter:{per_page:500}){ scenes{ id title urls } } }').then(function (data) { var map = {}; var scenes = ((data && data.findScenes && data.findScenes.scenes) || []); for (var i = 0; i < scenes.length; i++) { var s = scenes[i]; for (var j = 0; j < ((s.urls) || []).length; j++) { var id = extractMovieId(s.urls[j]); if (id && !map[id]) map[id] = s; } } sceneMapCache = map; return map; }); }
  function fetchPerformerTitleMap(pid) { if (performerTitleMapCache && performerTitleMapFor === String(pid)) return Promise.resolve(performerTitleMapCache); var num = parseInt(pid, 10); return gql('query{ findScenes(scene_filter:{performers:{value:[' + num + '], modifier:INCLUDES}}, filter:{per_page:200}){ count scenes{ id title urls } } }').then(function (data) { var map = {}; var scenes = ((data && data.findScenes && data.findScenes.scenes) || []); for (var i = 0; i < scenes.length; i++) { var k = normTitle(scenes[i].title); if (k && !map[k]) map[k] = scenes[i]; } performerTitleMapCache = map; performerTitleMapFor = String(pid); return map; }); }
  function titleLinkForCard(card) { var links = card.querySelectorAll('a[href*="/movies/"]'); for (var li = 0; li < links.length; li++) { if ((links[li].innerText || '').trim()) return links[li]; } return null; }
  function styleVideoTitle(card, hit) { var link = titleLinkForCard(card); if (!link) return; var t = link.querySelector('span') || link; if (t.getAttribute && t.getAttribute('data-rsl-video-green') === '1') return; t.style.color = '#22c55e'; t.style.fontWeight = '700'; t.setAttribute('data-rsl-video-green', '1'); try { t.title = (hit.title || '') + ' (Stash id ' + hit.id + ')'; } catch (e) {} var chk = document.createElement('span'); chk.setAttribute('data-rsl-video-check', '1'); chk.textContent = '\u2713 '; chk.style.cssText = 'color:#22c55e;font-weight:800;'; try { t.insertBefore(chk, t.firstChild); } catch (e2) {} }
  function markVideos(urlMap, titleMap) { var um = urlMap || sceneMapCache || {}; var tm = (typeof titleMap === 'undefined') ? performerTitleMapCache : titleMap; var cards = document.querySelectorAll('.movies-thumb-entry'); for (var i = 0; i < cards.length; i++) { var card = cards[i]; var hit = matchSceneForCard(card, um, tm); if (!hit) continue; if (!card.querySelector('.' + VIDEO_BADGE_CLASS)) { try { if (getComputedStyle(card).position === 'static') card.style.position = 'relative'; } catch (e) {} var b = document.createElement('a'); b.className = VIDEO_BADGE_CLASS; b.textContent = '\u2713 IN STASH'; b.href = STASH_ORIGIN + '/scenes/' + hit.id; b.target = '_blank'; b.rel = 'noopener'; b.title = (hit.title || '') + ' (Stash id ' + hit.id + ')'; b.style.cssText = 'position:absolute;top:6px;left:6px;z-index:5;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.4);'; card.appendChild(b); } try { styleVideoTitle(card, hit); } catch (e2) {} } }
  function extractModelId(href) { var m = String(href || '').match(/\/models\/(\d+)/); return m ? m[1] : null; }
  function modelCardForLink(a) { try { var card = a.closest('.ant-card'); if (card) return card; } catch (e) {} var el = a; for (var mi = 0; mi < 4 && el; mi++) { el = el.parentElement; if (el && el.classList && el.classList.contains('models-grid-entry')) return el; } return a.parentElement || a; }
  function modelNameForLink(a, card) { var s = card.querySelector('.ant-card-meta-description span') || card.querySelector('span'); if (s && s.textContent.trim()) return s.textContent.trim(); var t = (a.innerText || '').trim(); if (t && t.length < 80) return t; return ''; }
  function normName(s) { return String(s || '').toLowerCase().trim(); }
  function fetchPerformerMap() { if (performerMapCache) return Promise.resolve(performerMapCache); if (performerMapPromise) return performerMapPromise; performerMapPromise = (function next(page, acc) { return gql('query($p:Int!){ findPerformers(filter:{per_page:500, page:$p}){ count performers{ id name urls } } }', { p: page }).then(function (data) { var ps = (data && data.findPerformers && data.findPerformers.performers) || []; var all = acc.concat(ps); if (ps.length < 500 || page >= 10) { var map = {}; for (var i = 0; i < all.length; i++) { var k = normName(all[i].name); if (k && !map[k]) map[k] = all[i]; } performerMapCache = map; return map; } return next(page + 1, all); }); })(1, []); return performerMapPromise; }
  function clearModelMarks() { var els = document.querySelectorAll('.' + MODEL_BADGE_CLASS + ', .' + MODEL_ADD_CLASS); for (var ci2 = 0; ci2 < els.length; ci2++) els[ci2].remove(); var names = document.querySelectorAll('[data-rsl-name-green="1"]'); for (var cj = 0; cj < names.length; cj++) { names[cj].style.color = ''; names[cj].style.fontWeight = ''; names[cj].removeAttribute('data-rsl-name-green'); } }
  // The handlers below only read pageUrl synchronously and performerMapCache at click time (the shared cache), so the loop closures are safe.
  // eslint-disable-next-line no-loop-func
  function markModelCards(map) { var links = document.querySelectorAll('a[href*="/models/"]'); for (var i = 0; i < links.length; i++) { var a = links[i]; var href = a.getAttribute('href') || a.href || ''; var rid = extractModelId(href); if (!rid) continue; var card = modelCardForLink(a); if (!card || card.querySelector(':scope > .' + MODEL_BADGE_CLASS)) continue; var name = modelNameForLink(a, card); if (!name) continue; var hit = map[normName(name)]; if (!hit) continue; try { if (getComputedStyle(card).position === 'static') card.style.position = 'relative'; } catch (e) {} var pageUrl = location.origin + '/models/' + rid; var hasUrl = (hit.urls || []).some(function (u) { return normUrl(u).toLowerCase() === normUrl(pageUrl).toLowerCase(); }); var b = document.createElement('a'); b.className = MODEL_BADGE_CLASS; b.textContent = '\u2713 IN STASH'; b.href = STASH_ORIGIN + '/performers/' + hit.id; b.target = '_blank'; b.rel = 'noopener'; b.title = hit.name + ' (Stash id ' + hit.id + ')'; b.style.cssText = 'position:absolute;top:6px;left:6px;z-index:5;background:#16a34a;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;text-decoration:none;box-shadow:0 1px 4px rgba(0,0,0,.4);'; b.addEventListener('click', function (ev) { ev.stopPropagation(); }); card.appendChild(b); var ns = card.querySelector('.ant-card-meta-description span') || card.querySelector('span'); if (ns && !ns.getAttribute('data-rsl-name-green')) { ns.style.color = '#22c55e'; ns.style.fontWeight = '700'; ns.setAttribute('data-rsl-name-green', '1'); } if (!hasUrl && !card.querySelector(':scope > .' + MODEL_ADD_CLASS)) { (function (h, url, c2) { var add = document.createElement('button'); add.className = MODEL_ADD_CLASS; add.textContent = '+ URL'; add.title = 'Save ' + url + ' on ' + h.name + ' in Stash'; add.style.cssText = 'position:absolute;top:6px;right:6px;z-index:5;background:#b45309;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;border:none;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.4);'; add.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); add.disabled = true; add.textContent = '...'; var nxt = (h.urls || []).slice(); nxt.push(url); gql('mutation($input:PerformerUpdateInput!){ performerUpdate(input:$input){ id urls } }', { input: { id: h.id, urls: nxt } }).then(function () { add.remove(); var k = normName(h.name); if (performerMapCache && performerMapCache[k]) performerMapCache[k].urls = nxt; }).catch(function (err) { add.disabled = false; add.textContent = '+ URL'; alert('Stash update failed: ' + err.message); }); }); c2.appendChild(add); })(hit, pageUrl, card); } } }
  function runListing(force) { if (!force && location.pathname === lastPath && performerMapCache) { try { markModelCards(performerMapCache); } catch (e) {} return; } lastPath = location.pathname; removePanel(); resetHeading(); clearVideoMarks(); performerFound = false; fetchPerformerMap().then(function (map) { markModelCards(map); }).catch(function () {}); }
  function findAnchor() { return document.querySelector('.model-name-container') || document.querySelector('h2'); }
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
    check.textContent = '\u2713 ';
    check.style.cssText = 'color:#22c55e;font-weight:800;';
    foundLine.appendChild(check);
    foundLine.appendChild(document.createTextNode('Found in Stash: '));
    var nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.cssText = 'color:#22c55e;font-weight:700;';
    foundLine.appendChild(nameSpan);
    foundLine.appendChild(document.createTextNode(' (id ' + p.id + ')'));
    line(hasUrl ? 'This Reptyle URL is saved on the performer.' : 'This Reptyle URL is NOT saved on the performer.', hasUrl ? '#94a3b8' : '#fcd34d');
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
        var next = p.urls.slice();
        next.push(state.pageUrl);
        gql('mutation($input:PerformerUpdateInput!){ performerUpdate(input:$input){ id urls } }', { input: { id: p.id, urls: next } }).then(function () { run(true); }).catch(function (e) { btn.disabled = false; btn.textContent = 'Add this URL in Stash'; alert('Stash update failed: ' + e.message); });
      });
      row.appendChild(btn);
    }
    var vidLine = line('', '#94a3b8');
    anchor.insertAdjacentElement('afterend', div);
    performerFound = true;
    Promise.all([fetchReptyleSceneMap(), fetchPerformerTitleMap(p.id)]).then(function (maps) { var urlMap = maps[0] || {}; var titleMap = maps[1] || {}; markVideos(urlMap, titleMap); var cards = document.querySelectorAll('.movies-thumb-entry'); var total = 0, hit = 0; for (var k = 0; k < cards.length; k++) { var la = cards[k].querySelector('a[href*="/movies/"]'); if (!la) continue; var mid = extractMovieId(la.getAttribute('href') || la.href); if (!mid && !cardTitleForCard(cards[k])) continue; total++; if (matchSceneForCard(cards[k], urlMap, titleMap)) hit++; } vidLine.textContent = total ? ('Videos on this page in Stash: ' + hit + '/' + total) : 'No videos found on this page.'; vidLine.style.color = hit ? '#86efac' : '#94a3b8'; }).catch(function () { vidLine.textContent = 'Video check failed.'; });
  }
  function runDetail(force) {
    if (!/^\/models\/\d+/.test(location.pathname)) { removePanel(); resetHeading(); clearVideoMarks(); performerFound = false; sceneMapCache = null; performerTitleMapCache = null; performerTitleMapFor = null; return; }
    if (!force && location.pathname === lastPath && document.getElementById(PANEL_ID)) return;
    lastPath = location.pathname;
    var anchor = findAnchor();
    if (!anchor) return;
    var name = getModelName();
    var pageUrl = getPageUrl();
    if (!name) return;
    renderLoading(anchor, name);
    gql('query($q:String!){ findPerformers(filter:{q:$q, per_page:10}){ count performers{ id name urls } } }', { q: name }).then(function (data) {
      var fp = (data && data.findPerformers) || { count: 0, performers: [] };
      var exact = null;
      for (var i = 0; i < fp.performers.length; i++) { if (fp.performers[i].name.toLowerCase() === name.toLowerCase()) { exact = fp.performers[i]; break; } }
      var a2 = findAnchor();
      if (a2) render(a2, { name: name, pageUrl: pageUrl, count: fp.count, exact: exact, candidates: fp.performers.slice(0, 5) });
    }).catch(function (e) {
      var a3 = findAnchor();
      if (a3) render(a3, { name: name, pageUrl: pageUrl, error: e.message });
    });
  }
  function run(force) { if (/^\/models\/\d+/.test(location.pathname)) return runDetail(force); if (/^\/models\/?$/.test(location.pathname)) return runListing(force); removePanel(); resetHeading(); clearVideoMarks(); clearModelMarks(); performerFound = false; sceneMapCache = null; performerTitleMapCache = null; performerTitleMapFor = null; }
  var tries = 0;
  var boot = setInterval(function () { tries++; if (findAnchor() || document.querySelector('.models-grid-entry')) { clearInterval(boot); run(true); } else if (tries > 40) clearInterval(boot); }, 500);
  setInterval(function () { try { if (performerFound && (sceneMapCache || performerTitleMapCache)) markVideos(sceneMapCache, performerTitleMapCache); } catch (e) {} try { if (performerMapCache && /^\/models\/?$/.test(location.pathname)) markModelCards(performerMapCache); } catch (e2) {} run(false); }, 2000);
})();

