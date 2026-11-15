import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../WindowPreview.js', import.meta.url)), 'utf8')
  .replace(/^\.pragma library\s*/, '');
const module = {exports: {}};
new Function('module', source)(module);
const P = module.exports;

const ghostty = {lastIpcObject: {class: 'ghostty'}, wayland: {appId: 'ghostty'}};
const zoomClass = {lastIpcObject: {class: 'zoom-controls-chromium'}, wayland: {appId: 'zoom-controls-chromium'}};
const zoomInitial = {lastIpcObject: {initialClass: 'zoom-controls-chromium'}};
const zoomAppId = {wayland: {appId: 'zoom-controls-chromium'}};

assert.equal(P.ZOOM_CLASS, 'zoom-controls-chromium');
assert.equal(P.findZoomToplevel([null, ghostty, zoomClass], P.ZOOM_CLASS), zoomClass);
assert.equal(P.findZoomToplevel([zoomInitial], P.ZOOM_CLASS), zoomInitial);
assert.equal(P.findZoomToplevel([zoomAppId], P.ZOOM_CLASS), zoomAppId);
assert.equal(P.findZoomToplevel([ghostty], P.ZOOM_CLASS), null);
assert.equal(P.findZoomToplevel([], P.ZOOM_CLASS), null);

assert.deepEqual(P.fit(1600, 1000, 320, 180), {width: 288, height: 180});
assert.deepEqual(P.fit(1920, 1080, 320, 200), {width: 320, height: 180});
assert.deepEqual(P.fit(0, 0, 320, 180), {width: 320, height: 180});
console.log('PASS: Zoom toplevel lookup and preview aspect fit');
