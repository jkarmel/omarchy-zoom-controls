import {strict as assert} from 'node:assert';
import http from 'node:http';
import {once,EventEmitter} from 'node:events';
import {targetsAt,targetsSchema,debugEndpoint,pageState,MAX_MESSAGE_BYTES,MAX_TARGETS} from '../backend/protocol.mjs';
import {CDP} from '../backend/cdp.mjs';
import {DebugSocket} from '../backend/websocket.mjs';
const endpoint='http://127.0.0.1:1234';
const target={id:'test',type:'page',url:'https://app.zoom.us/wc/home',webSocketDebuggerUrl:'ws://127.0.0.1:1234/devtools/page/test'};
assert.equal(debugEndpoint(target.webSocketDebuggerUrl,endpoint),target.webSocketDebuggerUrl);
for(const url of ['ws://example.org:1234/devtools/page/test','ws://127.0.0.1:4321/devtools/page/test',
 'https://127.0.0.1:1234/devtools/page/test','ws://localhost:1234/devtools/page/test',
 'ws://user@127.0.0.1:1234/devtools/page/test','ws://127.0.0.1:1234/devtools/page/test?redirect=x'])
 assert.throws(()=>debugEndpoint(url,endpoint));
for(const body of [{},[null],Array(MAX_TARGETS+1).fill(target),[{...target,id:'different'}],
 [{...target,webSocketDebuggerUrl:'ws://example.org:1234/devtools/page/test'}]])assert.throws(()=>targetsSchema(body,endpoint));
assert.throws(()=>pageState({state:'meeting',title:'x',capabilities:{},meeting:{}}));
assert.throws(()=>pageState({state:'idle',title:'x'.repeat(2049),capabilities:{}}));
let route='normal',foreignRequests=0;
const foreign=http.createServer((req,res)=>{foreignRequests++;res.end('[]')}).listen(0,'127.0.0.1');await once(foreign,'listening');
const server=http.createServer((req,res)=>{
 if(route==='redirect'){res.writeHead(302,{Location:`http://127.0.0.1:${foreign.address().port}/`});res.end();return}
 if(route==='large'){res.end(' '.repeat(MAX_MESSAGE_BYTES+1));return}
 if(route==='malformed'){res.end('{');return}
 res.end(JSON.stringify([{...target,webSocketDebuggerUrl:`ws://127.0.0.1:${server.address().port}/devtools/page/test`}]))
}).listen(0,'127.0.0.1');await once(server,'listening');
try {
 const url=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await targetsAt(url)).length,1);
 for(route of ['redirect','large','malformed'])await assert.rejects(()=>targetsAt(url));
 assert.equal(foreignRequests,0,'HTTP redirects never contacted another endpoint');
}finally{server.closeAllConnections();server.close();foreign.closeAllConnections();foreign.close()}
class Socket extends EventEmitter {destroy(){this.destroyed=true}write(){}}
// Reject huge declared frames from the header alone, before reading a body.
const socket=new Socket(),ws=new DebugSocket(socket);let closed=false;ws.on('closed',()=>closed=true);
const header=Buffer.alloc(10);header[0]=129;header[1]=127;header.writeBigUInt64BE(BigInt(MAX_MESSAGE_BYTES+1),2);
socket.emit('data',header);assert.equal(closed,true);assert.equal(ws.buffer.length,0);
const s2=new Socket(),w2=new DebugSocket(s2);let text='';w2.on('message',value=>text=value);
s2.emit('data',Buffer.from([1,2,104,101]));s2.emit('data',Buffer.from([128,3,108,108,111]));assert.equal(text,'hello');w2.close();
for(const bad of ['{','[]','{"id":"wrong","result":{}}','{"method":123}']) {
 const socket=new Socket(),ws=new DebugSocket(socket),c=new CDP(ws);
 const pending=c.call('Runtime.evaluate');ws.emit('message',bad);
 await assert.rejects(pending,/Invalid|oversized/);assert.equal(c.pending.size,0);
}
console.log('PASS: endpoint identity, HTTP redirect rejection, bounded lists/frames, fragmentation, malformed CDP and page schemas');
