// Minimal bounded RFC 6455 transport for local Chromium CDP. Compression is not
// offered. Lengths are checked from the frame header before payload buffering.
import http from 'node:http';
import https from 'node:https';
import {randomBytes,createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {MAX_MESSAGE_BYTES} from './protocol.mjs';
export class DebugSocket extends EventEmitter {
  constructor(socket) {
    super();this.socket=socket;this.buffer=Buffer.alloc(0);this.fragments=[];this.bytes=0;this.fragmented=false;this.closed=false;
    socket.on('data',chunk=>{try{this.consume(chunk)}catch{this.close(new Error('Invalid or oversized debugging WebSocket frame.'))}});
    socket.on('error',()=>this.close(new Error('Debugging WebSocket failed.')));
    socket.on('close',()=>this.close());
  }
  static connect(url) {
    return new Promise((resolve,reject)=>{
      const u=new URL(url),key=randomBytes(16).toString('base64');
      const request=(u.protocol==='ws:'?http:https).request({protocol:u.protocol==='ws:'?'http:':'https:',hostname:u.hostname.replace(/^\[|\]$/g,''),port:u.port,path:u.pathname,
        method:'GET',maxHeaderSize:8192,headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':key}});
      const timer=setTimeout(()=>request.destroy(new Error('Zoom connection timed out.')),3000);
      request.on('error',error=>{clearTimeout(timer);reject(error)});
      request.on('response',response=>{clearTimeout(timer);response.destroy();reject(new Error('Debugging WebSocket upgrade rejected.'))});
      request.on('upgrade',(response,socket,head)=>{
        clearTimeout(timer);
        const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        if(response.statusCode!==101||response.headers['sec-websocket-accept']!==accept||response.headers['sec-websocket-extensions']||
          response.headers.upgrade?.toLowerCase()!=='websocket') {socket.destroy();reject(new Error('Invalid WebSocket handshake.'));return}
        const ws=new DebugSocket(socket);resolve(ws);
        // Consumers attach listeners before any buffered upgrade bytes are read.
        queueMicrotask(()=>{if(head.length){try{ws.consume(head)}catch{ws.close(new Error('Invalid debugging frame.'))}}});
      });
      request.end();
    });
  }
  consume(chunk) {
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=2&&!this.closed) {
      const b=this.buffer,fin=!!(b[0]&128),opcode=b[0]&15;let length=b[1]&127,offset=2;
      if(b[0]&112||b[1]&128)throw new Error('Unsupported frame flags.');
      if(length===126){if(b.length<4)return;length=b.readUInt16BE(2);offset=4}
      else if(length===127){if(b.length<10)return;const n=b.readBigUInt64BE(2);if(n>BigInt(MAX_MESSAGE_BYTES))throw new Error('Oversized frame.');length=Number(n);offset=10}
      const control=opcode>=8;
      if(length>MAX_MESSAGE_BYTES||(!control&&this.bytes+length>MAX_MESSAGE_BYTES)||
        (control&&(!fin||length>125))||![0,1,8,9,10].includes(opcode))throw new Error('Invalid frame.');
      if(b.length<offset+length)return;
      const payload=b.subarray(offset,offset+length);this.buffer=b.subarray(offset+length);
      if(control){if(opcode===8){this.close();return}if(opcode===9)this.sendFrame(payload,10);continue}
      if((opcode===0&&!this.fragmented)||(opcode===1&&this.fragmented))throw new Error('Invalid fragmentation.');
      if(this.fragments.length>=1024)throw new Error('Excessive frame fragmentation.');
      this.fragments.push(payload);this.bytes+=length;this.fragmented=!fin;
      if(fin){const data=Buffer.concat(this.fragments,this.bytes);this.fragments=[];this.bytes=0;
        const text=new TextDecoder('utf-8',{fatal:true}).decode(data);this.emit('message',text)}
    }
  }
  sendFrame(data,opcode=1) {
    if(this.closed)throw new Error('Zoom connection closed.');
    if(data.length>MAX_MESSAGE_BYTES)throw new Error('Debugging request too large.');
    const extra=data.length<126?0:data.length<65536?2:8;
    const header=Buffer.alloc(2+extra+4);header[0]=128|opcode;header[1]=128|(extra===0?data.length:extra===2?126:127);
    if(extra===2)header.writeUInt16BE(data.length,2);else if(extra===8)header.writeBigUInt64BE(BigInt(data.length),2);
    const mask=randomBytes(4);mask.copy(header,2+extra);const payload=Buffer.from(data);
    for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
    this.socket.write(Buffer.concat([header,payload]));
  }
  send(text){this.sendFrame(Buffer.from(text))}
  close(error=new Error('Zoom connection closed.')) {
    if(this.closed)return;this.closed=true;this.buffer=Buffer.alloc(0);this.fragments=[];
    this.socket.destroy();this.emit('closed',error);
  }
}
