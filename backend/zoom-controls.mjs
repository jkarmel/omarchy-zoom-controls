#!/usr/bin/env node
import {readFile,readlink,mkdir} from 'node:fs/promises';
import {exec,launchBrowser} from './execution.mjs';
import {targetsAt,pageState} from './protocol.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
import {CDP} from './cdp.mjs';
import {zoomPage} from './page.mjs';
import {inviteLink, meetingLink, meetingDestination, zoomHome} from './home.mjs';
let config, configError;
try {config=await loadConfig();} catch(e) {configError=e;config={};}
const profile=config.profile;
const action=process.argv[2]||'status';
const expected=process.argv[3]||'';
async function endpoints(){
  const pids=new Set();
  // Read argv exactly: profile paths can contain spaces and regex characters.
  const {readdir}=await import('node:fs/promises');
  for(const pid of await readdir('/proc')) {
    if(!/^\d+$/.test(pid))continue;
    try {
      const raw=await readFile('/proc/'+pid+'/cmdline','utf8');
      const args=raw.split('\0').filter(Boolean);
      const exact=args.includes('--user-data-dir='+profile)||args.some((a,i)=>a==='--user-data-dir'&&args[i+1]===profile);
      // Some Chromium launchers flatten argv after startup. Only allow exact
      // whitespace-delimited fallback for profiles without whitespace.
      const flat=!/\s/.test(profile)&&raw.split(/[\0\s]+/).includes('--user-data-dir='+profile);
      if((exact||flat)&&!args.some(a=>a.startsWith('--type='))&&!/--type=/.test(raw))pids.add(pid);
    }catch{}
  }
  // Chromium rewrites /proc argv into a flat title on some builds. Its
  // per-profile singleton lock identifies the owner even for paths with spaces.
  try {
    const pid=(await readlink(profile+'/SingletonLock')).match(/-(\d+)$/)?.[1];
    const raw=pid?await readFile('/proc/'+pid+'/cmdline','utf8'):'';
    if(raw.includes('--user-data-dir='+profile)&&!raw.includes('--type='))pids.add(pid);
  }catch{}
  if(!pids.size)return [];
  const {stdout}=await exec('/usr/bin/ss',['-ltnp'],{timeout:1500});
  const result=[];
  for(const line of stdout.split('\n')) {
    if(![...line.matchAll(/pid=(\d+)/g)].some(m=>pids.has(m[1])))continue;
    const address=line.trim().split(/\s+/)[3];
    if(/^(127\.0\.0\.1|\[::1\]):\d+$/.test(address))result.push('http://'+address);
  }
  return [...new Set(result)];
}
export async function discover(){
  const urls=await endpoints();
  if(urls.length>8)throw new Error('Too many browser debugging endpoints.');
  if(!urls.length)return {state:'offline', title:'Zoom is not connected', capabilities:{}};
  const found=[];
  let failed=false;
  for(const url of urls){
    try {
      const targets=await targetsAt(url);
      for(const t of targets){
        if(t.type!=='page')continue;
        const u=new URL(t.url);
        if(u.protocol!=='https:'||!/(^|\.)zoom\.us$/.test(u.hostname))continue;
        const c=await CDP.connect(t.webSocketDebuggerUrl,url);
        try{const state=pageState(await c.evaluate('('+zoomPage.toString()+')()'));found.push({...state,target:t.id,ws:t.webSocketDebuggerUrl,endpoint:url})}finally{c.close()}
      }
    }catch{failed=true}
  }
  const meetings=found.filter(s=>s.state==='meeting');
  if(meetings.length>1)return {state:'unknown',title:'Multiple Zoom meetings — open Zoom',capabilities:{}};
  if(failed)return {state:'unknown',title:'Unable to read Zoom controls',capabilities:{}};
  if(meetings.length===1)return meetings[0];
  return found[0]||{state:'idle',title:'No active meeting',capabilities:{}};
}
async function clipboardMeeting() {
  try {
    const {stdout}=await exec('/usr/bin/wl-paste',['--no-newline'],{timeout:1000,maxBuffer:8192});
    return meetingLink(stdout);
  } catch { return null; }
}
async function homeAction(action) {
  let state=await discover();
  if(state.state==='meeting'||state.state==='unknown')throw new Error('A meeting is active or Zoom is still loading. Reopen the menu.');
  // Validate again at click time; clipboard contents never enter status output.
  const link=action==='join-clipboard'?await clipboardMeeting():action==='join'?meetingDestination(process.argv[4] || ''):null;
  if(action==='join'&&!link)throw new Error('Enter a Zoom meeting link or a 9–11 digit meeting ID.');
  if(action==='join-clipboard'&&!link)throw new Error('The clipboard no longer contains a Zoom meeting link.');
  await showZoom();
  for(let n=0;n<30;n++) {
    state=await discover();
    if(state.ws)break;
    await new Promise(r=>setTimeout(r,200));
  }
  if(state.state!=='idle'||!state.ws)throw new Error('Zoom is not ready. Open Zoom and sign in first.');
  const c=await CDP.connect(state.ws,state.endpoint);
  try {
    // A second check catches a meeting that started while the window opened.
    const current=await c.evaluate('('+zoomPage.toString()+')()');
    if(current.state!=='idle')throw new Error('The meeting changed. Reopen the Zoom menu.');
    if(action==='join-clipboard'||action==='join') {
      const result=await c.call('Page.navigate',{url:link});
      if(result.errorText)throw new Error('Zoom could not open the copied meeting link.');
      return {ok:true,message:action==='join-clipboard'?'Opening copied meeting':'Opening meeting'};
    }
    // Join error/prejoin pages may remain after an attempt. Start always returns
    // to the signed-in home screen before invoking New meeting.
    if (!await c.evaluate("location.hostname==='app.zoom.us' && location.pathname==='/wc/home'")) {
      await c.call('Page.navigate',{url:'https://app.zoom.us/wc/home'});
      for(let n=0;n<40;n++) {
        await new Promise(r=>setTimeout(r,150));
        try {if(await c.evaluate("!!document.querySelector('button[aria-label=\"New meeting\"]')"))break;}catch{}
      }
    }
    let result;
    try {result=await c.evaluate('('+zoomHome.toString()+')('+JSON.stringify(action)+')',true);}
    catch(e) {
      if(action!=='start'||!/context.*destroyed|target navigated or closed/i.test(e.message))throw e;
      result={ok:true,verifyStarted:true};
    }
    if(result.verifyStarted) {
      for(let n=0;n<50;n++) {
        const after=await discover();
        if(after.state==='meeting')return {ok:true,message:'Meeting started'};
        await new Promise(r=>setTimeout(r,200));
      }
      throw new Error('Zoom has not started the meeting yet. Check the Zoom window for a sign-in or setup prompt.');
    }
    return result;
  } finally {c.close();}
}
async function showZoom(){
  if(config.launcher) {
    await exec(config.launcher[0],config.launcher.slice(1),{timeout:40000,custom:true});
    return;
  }
  const state=await discover();
  if(state.ws) {
    const c=await CDP.connect(state.ws,state.endpoint);
    try {await c.call('Page.bringToFront');}finally{c.close();}
    const {stdout}=await exec('/usr/bin/hyprctl',['clients','-j'],{timeout:2000});
    for(const client of JSON.parse(stdout)) {
      try {
        const argv=(await readFile('/proc/'+client.pid+'/cmdline','utf8')).split('\0');
        const lockPid=(await readlink(profile+'/SingletonLock').catch(()=>'' )).match(/-(\d+)$/)?.[1];
        if(!/^0x[0-9a-f]+$/i.test(client.address))continue;
        if(!argv.includes('--user-data-dir='+profile)&&!(String(client.pid)===lockPid&&argv.join(' ').includes('--user-data-dir='+profile)))continue;
        await exec('/usr/bin/hyprctl',['dispatch','hl.dsp.focus({ window = "address:'+client.address+'" })'],{timeout:2000});
        return;
      }catch{}
    }
    return;
  }
  await mkdir(profile,{recursive:true,mode:0o700});
  // A dedicated profile avoids enabling remote control on ordinary browsing.
  const args=['--ozone-platform=wayland','--no-first-run','--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'--class=zoom-controls-chromium','--new-window','https://app.zoom.us/wc/home'];
  await launchBrowser(config.browser,args);
}
async function main(){
  if(configError)throw configError;
  if(action==='show'){await showZoom();return {ok:true}}
  if(['start','join','join-clipboard'].includes(action))return homeAction(action);
  const state=await discover();
  const token=state.target&&state.meeting?JSON.stringify([state.target,state.meeting]):'';
  if(action==='status') {const {ws,endpoint,meeting,target,...publicState}=state;return {...publicState,clipboardMeeting:['idle','offline'].includes(state.state)?!!await clipboardMeeting():false,token,checkedAt:Date.now()}}
  if(state.state!=='meeting'||!token||token!==expected)throw new Error('The meeting changed or is unavailable. Reopen the Zoom menu.');
  if(['share','chat','participants'].includes(action))await showZoom();
  const c=await CDP.connect(state.ws,state.endpoint);
  try{
    let result;
    try { result=await c.evaluate('('+zoomPage.toString()+')('+JSON.stringify(action)+','+JSON.stringify(state.meeting)+')',true); }
    catch(e) {
      if(action !== 'leave' || !/context.*destroyed|connection closed|Cannot find context|target navigated or closed/i.test(e.message)) throw e;
      result = {ok:true,verifyLeft:true};
    }
    if(result.verifyLeft) {
      for(let n=0;n<40;n++) {
        const after=await discover();
        if(after.state==='idle'||after.state==='offline'||(after.state==='meeting'&&after.meeting!==state.meeting))return {ok:true,message:'Left the meeting'};
        await new Promise(r=>setTimeout(r,150));
      }
      throw new Error('Zoom has not left the meeting. It may require a host transfer; open Zoom to finish.');
    }
    if(!result.ok) throw new Error('Zoom is no longer in that meeting. Reopen the menu.');
    if(result.link){
      const link=inviteLink(result.link);
      if(!link||link.length>8192)throw new Error('Zoom did not provide a valid invite link.');
      const cmd=config.clipboardCommand||[fileURLToPath(new URL('../bin/copy-link',import.meta.url))];
      await exec(cmd[0],cmd.slice(1),{timeout:10000,maxBuffer:8192,custom:true,input:link});
      return {ok:true,message:'Invite link copied'};
    }
    return {...result,message:action==='share'?'Choose what to share in Zoom':''};
  }finally{c.close()}
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try{console.log(JSON.stringify(await main()))}catch(e){console.log(JSON.stringify({ok:false,state:'unknown',capabilities:{},error:e.message}));process.exitCode=1}
}
