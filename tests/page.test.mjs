import {strict as assert} from 'node:assert';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {CDP} from '../backend/cdp.mjs';
import {zoomPage} from '../backend/page.mjs';
const tmp=await mkdtemp('/tmp/zoom-controls-browser-test-');
const browser=spawn(process.env.ZOOM_TEST_BROWSER || '/usr/lib/chromium/chromium',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+tmp,'about:blank'],{stdio:'ignore'});
let c;
try {
 let port;
 for(let i=0;i<100;i++){try{port=(await readFile(tmp+'/DevToolsActivePort','utf8')).split('\n')[0];break}catch{await new Promise(r=>setTimeout(r,50))}}
 assert.ok(port,'Test browser started');
 const ts=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 c=await CDP.connect(ts.find(t=>t.type==='page').webSocketDebuggerUrl,'http://127.0.0.1:'+port);
 const run=(a='status',m='')=>c.evaluate('('+zoomPage.toString()+')('+JSON.stringify(a)+','+JSON.stringify(m)+')',true);
 assert.equal((await run()).state,'idle');
 await c.evaluate(`document.body.innerHTML = '<footer id="wc-footer"><button id="meeting-info-indication">Test meeting</button><button id="mic" aria-label="mute my microphone">Mute</button><button id="video" aria-label="stop my video">Video</button><button id="chat" aria-label="open the chat panel">Chat</button><button id="people" aria-label="open the manage participants list pane,1 particpants">Participants</button><button id="more">More</button><button id="end" aria-label="End">End</button></footer><button id="stop" style="display:none">Stop Share</button>';window.log=[];document.querySelector('#mic').onclick=e=>{log.push('mic');e.currentTarget.setAttribute('aria-label',e.currentTarget.getAttribute('aria-label').startsWith('mute')?'unmute my microphone':'mute my microphone')};document.querySelector('#video').onclick=e=>{log.push('video');e.currentTarget.setAttribute('aria-label',e.currentTarget.getAttribute('aria-label').startsWith('stop')?'start my video':'stop my video')};document.querySelector('#more').onclick=()=>{const prev=document.querySelector('#overflow');if(prev){prev.remove();return}const b=document.createElement('div');b.id='overflow';b.setAttribute('role','button');b.textContent='Share';b.onclick=()=>{log.push('share-picker');b.remove()};document.body.appendChild(b)};document.querySelector('#meeting-info-indication').onclick=()=>{const prev=document.querySelector('.meeting-info-icon__meeting-url');if(prev){prev.remove();return}const f=document.createElement('div');f.className='meeting-info-icon__meeting-url';f.textContent='https://example.zoom.us/j/123456789?pwd=test';document.body.appendChild(f)};document.querySelector('#stop').onclick=e=>{log.push('stop-share');e.currentTarget.style.display='none'};document.querySelector('#end').onclick=()=>{log.push('leave-confirmation');const box=document.createElement('div');box.id='leave-menu';box.innerHTML='<button id="end-all">End Meeting for All</button><button id="leave-final">Leave Meeting</button>';document.body.appendChild(box);box.querySelector('#end-all').onclick=()=>log.push('DANGER-end-all');box.querySelector('#leave-final').onclick=()=>{log.push('left-meeting');document.querySelector('#wc-footer').style.display='none';box.remove()}};for(const [id,label,cls] of [['chat','the chat panel','chat-container'],['people','the manage participants list pane','participants-section-container']])document.querySelector('#'+id).onclick=e=>{const panel=document.querySelector('.'+cls);if(panel)panel.remove();else{const el=document.createElement('div');el.className=cls;el.textContent='Panel';document.body.appendChild(el)}e.currentTarget.setAttribute('aria-label',(panel?'open ':'close ')+label)};`);
 const state=await run();const key=state.meeting;
 assert.equal(state.muted,false);assert.equal(state.cameraOn,true);assert.equal(state.sharing,false);assert.equal(state.capabilities.share,true);
 assert.deepEqual(await c.evaluate('log'),[],'Status never clicks');
 await assert.rejects(()=>run('mute','old meeting'),/meeting changed/);
 await run('mute',key);assert.equal((await run()).muted,true);
 await assert.rejects(()=>run('mute',key),/state changed/);
 await run('unmute',key);assert.equal((await run()).muted,false);
 await run('camera-off',key);assert.equal((await run()).cameraOn,false);
 await run('camera-on',key);assert.equal((await run()).cameraOn,true);
 await c.evaluate(`document.querySelector('#mic').setAttribute('aria-disabled','true')`);
 assert.equal((await run()).capabilities.mic,false);await assert.rejects(()=>run('mute',key),/unavailable/);
 await c.evaluate(`document.querySelector('#mic').setAttribute('aria-disabled','false')`);
 const copied=await run('copy',key);assert.equal(copied.link,'https://example.zoom.us/j/123456789?pwd=test');assert.equal(await c.evaluate(`!!document.querySelector('.meeting-info-icon__meeting-url')`),false,'Copy restores info popover');
 for(const action of ['chat','participants']) {await run(action,key);await run(action,key)}
 // Zoom can move Participants into More after another control is used.
 await c.evaluate(`document.querySelector('#people').style.display='none';window.originalMore=document.querySelector('#more').onclick;document.querySelector('#more').onclick=()=>{const b=document.createElement('div');b.id='overflow';b.setAttribute('role','button');b.textContent='Participants';b.onclick=()=>{const p=document.querySelector('#people');p.style.display='inline-block';p.click();b.remove()};document.body.appendChild(b)}`);
 assert.equal((await run()).capabilities.participants,true);
 await run('participants',key);assert.ok(await c.evaluate(`!!document.querySelector('.participants-section-container')`));
 await run('participants',key);assert.equal(await c.evaluate(`!!document.querySelector('.participants-section-container')`),false);
 await c.evaluate(`document.querySelector('#more').onclick=window.originalMore`);
 await run('share',key);assert.ok((await c.evaluate('log')).includes('share-picker'));
 await c.evaluate(`document.querySelector('#stop').style.display='block'`);
 assert.equal((await run()).sharing,true);await assert.rejects(()=>run('share',key),/Already sharing/);
 await run('stop-share',key);assert.equal((await run()).sharing,false);
 const left=await run('leave',key);assert.equal(left.verifyLeft,true);assert.equal((await c.evaluate('log')).at(-1),'left-meeting');assert.equal((await run()).state,'idle');
 assert.equal((await c.evaluate('log')).includes('DANGER-end-all'),false);
 // An already-open confirmation must finish leaving, without toggling it shut.
 await c.evaluate(`document.querySelector('#wc-footer').style.display='block';document.querySelector('#end').click()`);
 const before=(await c.evaluate('log')).filter(x=>x==='leave-confirmation').length;
 await run('leave',key);assert.equal((await c.evaluate('log')).filter(x=>x==='leave-confirmation').length,before);assert.equal((await run()).state,'idle');
 await c.evaluate(`document.querySelector('#wc-footer').style.display='none'`);assert.equal((await run()).state,'idle');
 console.log('PASS: idle/meeting, live labels, no read mutations, stale actions, disabled controls, copy cleanup, chat and participants toggles, overflow participants/share, stop share, full leave and already-open confirmation (never end-all)');
}finally{c?.close();const exited=once(browser,'exit');browser.kill();await exited;await rm(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
