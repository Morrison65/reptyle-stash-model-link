const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'reptyle-stash-model-link.user.js');
const source = fs.readFileSync(file, 'utf8');
const pkg = require('../package.json');
const header = /==UserScript==([\s\S]*?)==\/UserScript==/.exec(source)[1];
const meta = {};
for (const [, key, value] of header.matchAll(/^\/\/ @(\S+)\s*(.*)$/gm)) (meta[key] ||= []).push(value.trim());

test('metadata is complete and versions agree', () => {
    for (const key of ['name', 'namespace', 'version', 'description', 'match', 'grant', 'connect']) assert.ok(meta[key], key + ' is missing');
    assert.equal(meta.version[0], pkg.version);
    assert.equal(require(file).VERSION, pkg.version);
    assert.equal(pkg.name + '.user.js', path.basename(file));
});
test('Sider runtime leftovers are gone', () => {
    assert.equal(meta['bound-url'], undefined);
    assert.equal(meta.changelog, undefined);
    assert.doesNotMatch(source, /siderRuntime|\?r=[0-9a-f]{8}/);
});
test('every GM API used is granted and every grant is used', () => {
    const code = source.replace(/^\/\/.*$/gm, '');
    for (const api of new Set(code.match(/\bGM_[A-Za-z]+/g) || [])) assert.ok(meta.grant.includes(api), api + ' is used but not granted');
    for (const api of meta.grant) assert.match(code, new RegExp('\\b' + api + '\\b'), api + ' is granted but unused');
});

const { SITES, siteFor, normUrl, normTitle, normName, extractMovieId, extractModelId, extractGammaSceneId, extractGammaActorId, gammaNameFromUrl } = require('../reptyle-stash-model-link.user.js');

test('updates come from the raw file on master', () => {
    const raw = 'https://raw.githubusercontent.com/Morrison65/' + pkg.name + '/master/' + pkg.name + '.user.js';
    assert.deepEqual(meta.updateURL, [raw]);
    assert.deepEqual(meta.downloadURL, [raw]);
});
test('every adapter host has a whole-site @match and Stash is the only connect', () => {
    const hosts = SITES.flatMap(s => s.hosts);
    assert.deepEqual([...meta.match].sort(), hosts.map(h => 'https://' + h + '/*').sort());
    assert.deepEqual(meta.connect, ['localhost']);
});
test('adapters are complete and ids are unique', () => {
    const fields = ['id', 'hosts', 'detail', 'listing', 'videoCardSel', 'videoLinkSel', 'modelLinkSel', 'modelCardSel', 'modelEntrySel', 'modelNameSel', 'sceneUrlParts', 'sceneKey', 'modelKey', 'modelUrl'];
    for (const s of SITES) {
        for (const f of fields) assert.ok(s[f], s.id + ' lacks ' + f);
        assert.equal(typeof s.anchorSel, 'string', s.id + ' needs anchorSel (empty for a floating panel)');
        assert.ok(s.anchorSel || s.nameFromUrl, s.id + ' needs an anchor or nameFromUrl to find the name');
    }
    assert.equal(new Set(SITES.map(s => s.id)).size, SITES.length);
});
test('the adapter is chosen by host, subdomains included, look-alikes excluded', () => {
    assert.equal(siteFor('app.reptyle.com').id, 'reptyle');
    assert.equal(siteFor('APP.REPTYLE.COM').id, 'reptyle');
    assert.equal(siteFor('x.app.reptyle.com').id, 'reptyle');
    assert.equal(siteFor('evilapp.reptyle.com'), null);
    assert.equal(siteFor('reptyle.com'), null);
    assert.equal(siteFor(''), null);
});
test('reptyle adapter keys pages, scenes and models', () => {
    const r = siteFor('app.reptyle.com');
    assert.ok(r.detail.test('/models/11304'));
    assert.ok(!r.detail.test('/models'));
    assert.ok(r.listing.test('/models/'));
    assert.equal(r.sceneKey('https://app.reptyle.com/movies/32219?r=x'), '32219');
    assert.equal(r.modelKey('/models/11304/'), '11304');
    assert.equal(r.modelUrl('https://app.reptyle.com', '11304'), 'https://app.reptyle.com/models/11304');
});
test('ids come from movie and model links only', () => {
    assert.equal(extractMovieId('https://app.reptyle.com/movies/32219?r=x'), '32219');
    assert.equal(extractMovieId('/models/11304'), null);
    assert.equal(extractModelId('/models/11304/'), '11304');
    assert.equal(extractModelId('/movies/1'), null);
    assert.equal(extractModelId(null), null);
});
test('adult time adapter: detail and listing paths, scene ids shared across Gamma sites', () => {
    const at = siteFor('members.adulttime.com');
    assert.equal(at.id, 'adulttime');
    assert.ok(at.detail.test('/en/pornstar/view/Kenzie-Reeves/49648'));
    assert.ok(at.detail.test('/de/pornstar/Kenzie-Reeves/49648'));
    assert.ok(!at.detail.test('/en/pornstars'));
    assert.ok(at.listing.test('/en/pornstars'));
    assert.equal(at.sceneKey('https://members.adulttime.com/en/video/mommysboy/Be-Polite-To-Our-Guest-Young-Man/209586'), '209586');
    assert.equal(at.sceneKey('https://www.evilangel.com/en/video/Anally-Talented-03/67506'), '67506');
    assert.equal(at.sceneKey('/en/video/sample/1020/?utm=x'), '1020');
    assert.equal(at.sceneKey('/en/video/Room-101-Part-2'), null);
    assert.equal(at.modelKey('/en/pornstar/view/Kenzie-Reeves/49648'), '49648');
    assert.equal(at.modelUrl('https://members.adulttime.com', '49648', '/en/pornstar/view/Kenzie-Reeves/49648/'), 'https://members.adulttime.com/en/pornstar/view/Kenzie-Reeves/49648');
    assert.deepEqual(at.sceneUrlParts, ['/en/video/']);
});
test('gamma helpers read names and ids from URLs', () => {
    assert.equal(gammaNameFromUrl('/en/pornstar/view/Kenzie-Reeves/49648'), 'Kenzie Reeves');
    assert.equal(gammaNameFromUrl('/en/pornstar/view/Sof%C3%ADa-Lee/1'), 'Sof\u00eda Lee');
    assert.equal(gammaNameFromUrl('/en/pornstar/view/name/88709'), '');
    assert.equal(gammaNameFromUrl('/en/pornstar/view/-/48477'), '');
    assert.equal(gammaNameFromUrl('/en/video/x/1'), '');
    assert.equal(extractGammaActorId('https://www.evilangel.com/en/pornstar/view/34290'), '34290');
    assert.equal(gammaNameFromUrl('https://www.evilangel.com/en/pornstar/view/34290'), '');
    assert.equal(normTitle('Sofía in Café Olé'), 'sofia in cafe ole');
    assert.equal(extractGammaSceneId(null), null);
});
test('URL comparison ignores trailing slashes and padding', () => {
    assert.equal(normUrl(' https://app.reptyle.com/models/1// '), 'https://app.reptyle.com/models/1');
    assert.equal(normUrl(undefined), '');
});
test('title normalisation folds quotes, accents and punctuation', () => {
    assert.equal(normTitle('Caf\u00e9 \u2018Night\u2019 \u2013 Part  2!'), normTitle("cafe 'night' part 2"));
    assert.equal(normTitle(null), '');
});
test('model names compare without case, accents or punctuation', () => {
    assert.equal(normName('  Jane DOE '), 'jane doe');
    assert.equal(normName('Anna-Belle'), normName('anna belle'));
    assert.equal(normName('Sof\u00eda Lee'), 'sofia lee');
});
