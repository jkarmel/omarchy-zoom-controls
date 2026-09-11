import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const runner = fileURLToPath(new URL('./runtime.py', import.meta.url));
const keys = ['HOME','USER','LOGNAME','LANG','LC_ALL','LC_CTYPE','DISPLAY','WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME',
  'XDG_SESSION_TYPE','XDG_CURRENT_DESKTOP','DBUS_SESSION_BUS_ADDRESS','HYPRLAND_INSTANCE_SIGNATURE',
  'OMARCHY_REQUEST_WORKSPACE','ZOOM_CONTROLS_CONFIG'];
export const childEnvironment = Object.fromEntries(keys.filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
childEnvironment.PATH='/usr/bin';
export function exec(command, args=[], {timeout=2000,maxBuffer=65536,custom=false,input=''}={}) {
  return new Promise((resolve,reject)=>{
    // The Python supervisor validates executable ownership/permissions, strips
    // loader/startup variables, and kills the child process group on all exits.
    const p=spawn('/usr/bin/python3',['-I',runner,String(timeout/1000),String(maxBuffer),custom?'user':'system',command,...args],
      {env:childEnvironment,stdio:['pipe','pipe','pipe']});
    const chunks=[]; let bytes=0,failed=false;
    const fail=error=>{if(failed)return;failed=true;p.kill('SIGTERM');reject(error)};
    const timer=setTimeout(()=>fail(new Error('Zoom command supervisor timed out.')),timeout+1500);
    p.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBuffer)fail(new Error('Zoom command output is too large.'));else chunks.push(chunk)});
    p.stderr.on('data',()=>{});
    p.on('error',fail);
    p.on('close',code=>{clearTimeout(timer);if(failed)return;code===0?resolve({stdout:Buffer.concat(chunks).toString('utf8')}):reject(new Error('Zoom command failed or exceeded its limits.'))});
    p.stdin.on('error',error=>{if(error.code!=='EPIPE')fail(error)});
    p.stdin.end(input);
  });
}
export async function launchBrowser(browser,args) {
  // Resolve the explicitly configured browser before uwsm receives its argv.
  const {stdout}=await exec('/usr/bin/python3',['-I',runner,'resolve',browser],{timeout:2000});
  await exec('/usr/bin/uwsm-app',['--',JSON.parse(stdout),...args],{timeout:10000});
}
