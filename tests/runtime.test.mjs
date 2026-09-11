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
 const launcher=bin+'/custom-launcher';const captured=tmp+'/args';
 await writeFile(launcher,'#!/usr/bin/python3 -I\nimport sys\nopen('+JSON.stringify(captured)+',"w").write("\\n".join(sys.argv[1:])+"\\n")\n',{mode:0o755});
 await writeFile(config,JSON.stringify({profile:tmp+'/different-profile',launcher:[launcher,'custom argument with spaces']}));
 await run('show');assert.equal(await readFile(captured,'utf8'),'custom argument with spaces\n');
 await writeFile(config,'{invalid');
 try{await run('status');assert.fail('Expected invalid config error')}catch(e){assert.equal(JSON.parse(e.stdout).ok,false)}
 console.log('PASS: exact profile discovery, unrelated browser rejection, explicit custom launcher argv, config errors');
}finally{const exited=once(browser,'exit');browser.kill();await exited;await rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
