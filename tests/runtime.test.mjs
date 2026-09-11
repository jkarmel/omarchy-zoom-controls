import {strict as assert} from 'node:assert';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {spawn,execFile as execCb} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const exec=promisify(execCb);
const tmp=await mkdtemp('/tmp/zoom-runtime-test-');const profile=tmp+'/profile with spaces';
const cli=fileURLToPath(new URL('../backend/zoom-controls.mjs',import.meta.url));
const config=tmp+'/config.json';const env={...process.env,ZOOM_CONTROLS_CONFIG:config};
const run=async(...args)=>JSON.parse((await exec(process.execPath,[cli,...args],{env})).stdout);
const browser=spawn(process.env.ZOOM_TEST_BROWSER||'/usr/lib/chromium/chromium',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
try {
 for(let n=0;n<50;n++){try{await readFile(profile+'/DevToolsActivePort');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 await writeFile(config,JSON.stringify({profile}));
 assert.equal((await run('status')).state,'idle','Finds browser with a spaced profile path');
 await writeFile(config,JSON.stringify({profile:tmp+'/different-profile'}));
 assert.equal((await run('status')).state,'offline','Does not attach to another profile');
 const bin=tmp+'/bin';await mkdir(bin);
 await writeFile(bin+'/uwsm-app','#!/bin/sh\nprintf "%s\\n" "$@" > "$ZOOM_TEST_ARGS"\n',{mode:0o755});
 env.PATH=bin+':'+process.env.PATH;env.ZOOM_TEST_ARGS=tmp+'/args';
 await run('show');
 let args;for(let n=0;n<30;n++){try{args=await readFile(env.ZOOM_TEST_ARGS,'utf8');break}catch{await new Promise(r=>setTimeout(r,30))}}
 assert.ok(args.includes('--remote-debugging-port=0\n'));assert.ok(args.includes('--user-data-dir='+tmp+'/different-profile\n'));
 assert.ok(args.includes('--remote-debugging-address=127.0.0.1\n'));
 await writeFile(config,JSON.stringify({profile:tmp+'/different-profile',launcher:[bin+'/uwsm-app','custom argument with spaces']}));
 await run('show');assert.equal(await readFile(env.ZOOM_TEST_ARGS,'utf8'),'custom argument with spaces\n');
 await writeFile(config,'{invalid');
 try{await run('status');assert.fail('Expected invalid config error')}catch(e){assert.equal(JSON.parse(e.stdout).ok,false)}
 console.log('PASS: exact profile discovery, unrelated browser rejection, default/custom launcher argv, config errors');
}finally{const exited=once(browser,'exit');browser.kill();await exited;await rm(tmp,{recursive:true,force:true})}
