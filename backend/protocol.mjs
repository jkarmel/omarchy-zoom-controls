export const MAX_MESSAGE_BYTES=262144;
export const MAX_TARGETS=64;
export function object(value) {return value!==null && typeof value==='object' && !Array.isArray(value)}
export function debugEndpoint(value, endpoint) {
  const u=new URL(value), base=new URL(endpoint);
  if(!['http:','https:'].includes(base.protocol)||!['127.0.0.1','[::1]'].includes(base.hostname)||!base.port||base.username||base.password)
    throw new Error('Invalid discovered debugging endpoint.');
  if(u.protocol!==(base.protocol==='http:'?'ws:':'wss:')||u.hostname!==base.hostname||u.port!==base.port||
    u.username||u.password||u.hash||u.search||!/^\/devtools\/(page|browser)\/[A-Za-z0-9_-]{1,256}$/.test(u.pathname))
    throw new Error('Debugging WebSocket does not match the discovered loopback endpoint.');
  return u.href;
}
export function targetsSchema(value, endpoint) {
  if(!Array.isArray(value)||value.length>MAX_TARGETS)throw new Error('Invalid or excessive debugging targets.');
  return value.map(t=>{
    if(!object(t)||typeof t.id!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(t.id)||
      typeof t.type!=='string'||t.type.length>64||typeof t.url!=='string'||t.url.length>8192)
      throw new Error('Invalid debugging target schema.');
    if(t.type==='page') {
      if(typeof t.webSocketDebuggerUrl!=='string'||t.webSocketDebuggerUrl.length>2048)
        throw new Error('Missing debugging WebSocket.');
      debugEndpoint(t.webSocketDebuggerUrl,endpoint);
      if(new URL(t.webSocketDebuggerUrl).pathname!=='/devtools/page/'+t.id)throw new Error('Debugging target ID mismatch.');
    }
    return t;
  });
}
export async function targetsAt(endpoint) {
  // Validate before HTTP too; redirects may never escape the discovered socket.
  debugEndpoint(endpoint.replace(/^http/,'ws')+'/devtools/page/check',endpoint);
  const response=await fetch(endpoint+'/json/list',{redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!response.ok||!response.body)throw new Error('Cannot read debugging targets.');
  const reader=response.body.getReader();const chunks=[];let bytes=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>MAX_MESSAGE_BYTES)throw new Error('Debugging target list is too large.');chunks.push(value)}
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
  return targetsSchema(JSON.parse(Buffer.concat(chunks).toString('utf8')),endpoint);
}
export function pageState(value) {
  if(!object(value)||!['meeting','idle','unknown'].includes(value.state)||typeof value.title!=='string'||value.title.length>2048||!object(value.capabilities))
    throw new Error('Invalid Zoom state schema.');
  const result={state:value.state,title:value.title,capabilities:{}};
  for(const k of ['mic','video','copy','share','chat','participants','leave']) {
    if(value.capabilities[k]!==undefined){if(typeof value.capabilities[k]!=='boolean')throw new Error('Invalid Zoom capability.');result.capabilities[k]=value.capabilities[k]}
  }
  if(value.state==='meeting'){
    if(typeof value.meeting!=='string'||value.meeting.length>4096||!value.meeting)throw new Error('Invalid meeting identity.');
    result.meeting=value.meeting;
    for(const k of ['muted','cameraOn','sharing']){if(value[k]!==null&&typeof value[k]!=='boolean')throw new Error('Invalid Zoom control state.');result[k]=value[k]}
  }
  return result;
}
