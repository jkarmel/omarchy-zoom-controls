import {strict as assert} from 'node:assert';
import {activeWorkspaceName, focusWorkspaceDispatch} from '../backend/workspace.mjs';
import {currentWorkspace, focusWorkspace} from '../backend/zoom-controls.mjs';

const monitors = (active, special = null) => [{focused:false,activeWorkspace:{name:'4'},specialWorkspace:{name:'special:other'}},{focused:true,activeWorkspace:{name:active},specialWorkspace:special?{name:special}:{}}];

assert.equal(activeWorkspaceName({workspace:{name:'3'}}, monitors('2','special:scratchpad')),'3','Active window wins over the focused monitor');
assert.equal(activeWorkspaceName({workspace:{name:'special:scratchpad'}}, monitors('2')),'special:scratchpad','Special workspace is preserved');
assert.equal(activeWorkspaceName({}, monitors('1')),'1','Focused monitor is the fallback');
assert.equal(activeWorkspaceName(null, monitors('2','special:scratchpad')),'special:scratchpad','An open special workspace is the monitor fallback');
assert.equal(activeWorkspaceName(null, [{focused:false,activeWorkspace:{name:'9'}}]),'','Only the focused monitor is used');
assert.equal(activeWorkspaceName(null, null),'','Missing Hyprland data is harmless');
assert.equal(activeWorkspaceName({workspace:{name:''}}, [{focused:true,activeWorkspace:{name:''}}]),'','Empty workspace names are ignored');

assert.equal(focusWorkspaceDispatch('3'),'hl.dsp.focus({ workspace = "3" })');
assert.equal(focusWorkspaceDispatch('special:scratchpad'),'hl.dsp.focus({ workspace = "special:scratchpad" })');
assert.equal(focusWorkspaceDispatch('name "quoted"'),'hl.dsp.focus({ workspace = "name \\"quoted\\"" })');
assert.equal(focusWorkspaceDispatch('name\\path'),'hl.dsp.focus({ workspace = "name\\\\path" })');
for (const invalid of ['', ' ', 'line\nbreak', 'null\x00byte', 'x'.repeat(256), null, undefined, 42]) {
  assert.equal(focusWorkspaceDispatch(invalid), null, String(invalid).slice(0,40));
}

const calls = [];
const fakeRun = async (command, args) => {
  calls.push([command, args]);
  if (args[0] === 'activewindow') return {stdout: JSON.stringify({workspace:{name:'3'}})};
  return {stdout: JSON.stringify(monitors('2'))};
};
assert.equal(await currentWorkspace(fakeRun), '3');
assert.deepEqual(calls[0], ['/usr/bin/hyprctl', ['activewindow', '-j']], 'Active window is read first');

calls.length = 0;
const fakeFallback = async (command, args) => {
  calls.push([command, args]);
  if (args[0] === 'activewindow') throw new Error('No active window');
  return {stdout: JSON.stringify(monitors('2','special:scratchpad'))};
};
assert.equal(await currentWorkspace(fakeFallback), 'special:scratchpad', 'Focused special workspace survives an activewindow failure');
assert.deepEqual(calls.map(call => call[1][0]), ['activewindow', 'monitors']);

calls.length = 0;
await focusWorkspace('special:scratchpad', fakeRun);
assert.deepEqual(calls, [['/usr/bin/hyprctl', ['dispatch', 'hl.dsp.focus({ workspace = "special:scratchpad" })']]]);
calls.length = 0;
await assert.rejects(() => focusWorkspace('line\nbreak', fakeRun), /Invalid workspace/);
assert.deepEqual(calls, [], 'Invalid workspaces never reach Hyprland');

console.log('PASS: active and special workspace capture, focused monitor fallback, safe Lua dispatch, hyprctl args');
