import {DebugSocket} from './websocket.mjs';
import {debugEndpoint,object,MAX_MESSAGE_BYTES} from './protocol.mjs';
export class CDP {
  constructor(ws) {
    this.ws=ws;this.id=0;this.pending=new Map();
    ws.on('message',data=>{
      try {
        if(Buffer.byteLength(data)>MAX_MESSAGE_BYTES)throw new Error('Oversized CDP message.');
        const m=JSON.parse(data);
        if(!object(m))throw new Error('Invalid CDP message.');
        if(m.id===undefined){if(typeof m.method!=='string'||m.method.length>256||m.params!==undefined&&!object(m.params))throw new Error('Invalid CDP event.');return}
        if(!Number.isSafeInteger(m.id)||m.id<=0||(!object(m.result)&&!object(m.error)))throw new Error('Invalid CDP response.');
        const p=this.pending.get(m.id);
        if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error('Zoom debugging command failed.')):p.resolve(m.result)}
      }catch{ws.close(new Error('Invalid or oversized Zoom debugging response.'))}
    });
    ws.on('closed',error=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()});
  }
  static async connect(url,endpoint) {
    if(!endpoint)throw new Error('A discovered endpoint is required.');
    return new CDP(await DebugSocket.connect(debugEndpoint(url,endpoint)));
  }
  call(method,params={}) {
    return new Promise((resolve,reject)=>{
      if(this.ws.closed){reject(new Error('Zoom connection closed.'));return}
      const id=++this.id;
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Zoom did not respond'))},5000);
      this.pending.set(id,{resolve,reject,timer});
      try{this.ws.send(JSON.stringify({id,method,params}))}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
    });
  }
  async evaluate(expression,userGesture=false) {
    const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture});
    if(r.exceptionDetails)throw new Error(String(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'Zoom evaluation failed').slice(0,2048));
    if(!object(r.result)||typeof r.result.type!=='string')throw new Error('Invalid CDP evaluation result.');
    return r.result.value;
  }
  close(){this.ws.close()}
}
