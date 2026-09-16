import {strict as assert} from 'node:assert';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {spawn,execFile as execCb} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {CDP} from '../backend/cdp.mjs';
const exec=promisify(execCb);
const tmp=await mkdtemp('/tmp/zoom-runtime-test-');const profile=tmp+'/profile with spaces';
const cli=fileURLToPath(new URL('../backend/zoom-controls.mjs',import.meta.url));
const config=tmp+'/config.json';const env={...process.env,ZOOM_CONTROLS_CONFIG:config};
const run=async(...args)=>JSON.parse((await exec(process.execPath,[cli,...args],{env})).stdout);
const browser=spawn(process.env.ZOOM_TEST_BROWSER||'/usr/lib/chromium/chromium',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
let c;
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
 // Exercise the real copy CLI through discovery, page extraction, validation,
 // and clipboard stdin. Serve a synthetic Zoom page without joining a meeting.
 const clipboard=bin+'/capture-clipboard';const copied=tmp+'/copied';
 await writeFile(clipboard,'#!/usr/bin/python3 -I\nimport sys\nopen('+JSON.stringify(copied)+',"w").write(sys.stdin.read())\n',{mode:0o755});
 await writeFile(config,JSON.stringify({profile,clipboardCommand:[clipboard]}));
 const port=(await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];
 const endpoint='http://127.0.0.1:'+port;
 const targets=await(await fetch(endpoint+'/json/list')).json();
 c=await CDP.connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl,endpoint);
 const intercepted=[];
 c.ws.on('message',data=>{
   const event=JSON.parse(data);
   if(event.method==='Fetch.requestPaused') intercepted.push(c.call('Fetch.fulfillRequest',{
     requestId:event.params.requestId,responseCode:200,
     responseHeaders:[{name:'Content-Type',value:'text/html'}],
     body:Buffer.from('<!doctype html><title>Copy regression</title><body></body>').toString('base64')
   }));
 });
 await c.call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 await c.call('Page.navigate',{url:'https://app.zoom.us/wc/12345678901/start'});
 await Promise.all(intercepted);
 const invite='https://us02web.zoom.us/j/12345678901?pwd=a%2Bb%2fc.1&from=calendar';
 await c.evaluate(`document.body.innerHTML='<footer id="wc-footer"><button id="meeting-info-indication">Copy regression</button></footer><div class="meeting-info-icon__meeting-url"></div>';document.querySelector('.meeting-info-icon__meeting-url').textContent=${JSON.stringify(invite)}`);
 const state=await run('status');assert.equal(state.state,'meeting');
 assert.equal((await run('copy',state.token)).message,'Invite link copied');
 assert.equal(await readFile(copied,'utf8'),invite,'Copy preserves the original invite, including host, route, and encoded query');
 await writeFile(config,'{invalid');
 try{await run('status');assert.fail('Expected invalid config error')}catch(e){assert.equal(JSON.parse(e.stdout).ok,false)}
 console.log('PASS: exact profile discovery, unrelated browser rejection, explicit custom launcher argv, original invite copied through CLI, config errors');
}finally{c?.close();const exited=once(browser,'exit');browser.kill();await exited;await rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
