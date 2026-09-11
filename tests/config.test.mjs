import {strict as assert} from 'node:assert';
import {parseConfig} from '../backend/config.mjs';
const env={HOME:'/home/test',XDG_CONFIG_HOME:'/cfg',XDG_DATA_HOME:'/data'};
assert.deepEqual(parseConfig({},env),{profile:'/data/zoom-controls/chromium',browser:'chromium',launcher:null,clipboardCommand:null});
const custom=parseConfig({profile:'~/Zoom Profile',launcher:['~/bin/zoom','full'],clipboardCommand:['my-copy']},env);
assert.equal(custom.profile,'/home/test/Zoom Profile');assert.deepEqual(custom.launcher,['/home/test/bin/zoom','full']);
for(const x of [{profile:'relative'},{launcher:'sh -c anything'},{launcher:[]},{clipboardCommand:['ok',null]},[],null])assert.throws(()=>parseConfig(x,env));
console.log('PASS: portable defaults and explicit local overrides');
