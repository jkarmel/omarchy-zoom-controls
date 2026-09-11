import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';

export function parseConfig(value = {}, env = process.env) {
  const home = env.HOME || homedir();
  const expand = s => s.startsWith('~/') ? path.join(home, s.slice(2)) : s;
  const command = (name) => {
    const v = value[name];
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v) || !v.length || v.some(s => typeof s !== 'string' || !s || s.includes('\0'))) throw new Error(`${name} must be a nonempty argument array.`);
    return v.map(expand);
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Zoom configuration must be an object.');
  const profile = expand(value.profile || path.join(env.XDG_DATA_HOME || path.join(home, '.local/share'), 'zoom-controls/chromium'));
  if (!path.isAbsolute(profile)) throw new Error('profile must be an absolute path.');
  const browser = value.browser || 'chromium';
  if (typeof browser !== 'string' || !browser || browser.includes('\0')) throw new Error('browser must name an executable.');
  return {profile:path.resolve(profile), browser:expand(browser), launcher:command('launcher'), clipboardCommand:command('clipboardCommand')};
}
export async function loadConfig(env = process.env) {
  const file = env.ZOOM_CONTROLS_CONFIG || path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || homedir(), '.config'), 'zoom-controls/config.json');
  try {return parseConfig(JSON.parse(await readFile(file, 'utf8')), env);}
  catch(e) {if(e.code === 'ENOENT') return parseConfig({}, env); throw new Error('Cannot read Zoom controls configuration: ' + e.message);}
}
