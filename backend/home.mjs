// Validate shareable invites without changing Zoom's host, route, or query.
export function inviteLink(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' || !/(^|\.)zoom\.us$/i.test(u.hostname) || u.username || u.password || u.port) return null;
    const match = u.pathname.match(/^\/(?:j|wc\/join)\/(\d{9,11})\/?$/);
    const personal = u.pathname.match(/^\/my\/([a-zA-Z0-9._-]+)\/?$/);
    if (!match && !personal) return null;
    return u.href;
  } catch { return null; }
}

// The local plugin joins in the web app. Never use this conversion for sharing.
export function meetingLink(value) {
  const invite = inviteLink(value);
  if (!invite) return null;
  const u = new URL(invite);
  const match = u.pathname.match(/^\/(?:j|wc\/join)\/(\d{9,11})\/?$/);
  const out = new URL(match ? '/wc/join/' + match[1] : u.pathname.replace(/\/$/, ''), match ? 'https://app.zoom.us' : u.origin);
  if (u.searchParams.has('pwd')) out.searchParams.set('pwd', u.searchParams.get('pwd'));
  return out.href;
}

export function meetingDestination(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().replace(/[\s-]/g, '');
  return /^\d{9,11}$/.test(id) ? 'https://app.zoom.us/wc/join/' + id : meetingLink(value);
}

// Serialized into the already-selected Zoom page; only visible home controls.
export async function zoomHome(action) {
  const visible = e => !!e && e.checkVisibility() && e.getClientRects().length > 0;
  const find = label => [...document.querySelectorAll('button')].find(e => visible(e) && (e.getAttribute('aria-label') || e.innerText).trim().toLowerCase() === label);
  const joinInput = () => [...document.querySelectorAll('input')].find(e => visible(e) && /meeting id/i.test(e.placeholder));
  const click = e => { if (!e || e.disabled || e.getAttribute('aria-disabled') === 'true') throw new Error('Open Zoom and sign in to use this action.'); e.click(); };
  const waitFor = async fn => { for (let n=0;n<60;n++) {if(fn()) return; await new Promise(r=>setTimeout(r,50));} throw new Error('Zoom did not open the requested screen.'); };
  if (action === 'join' && joinInput()) return {ok:true};
  if (joinInput()) {click(find('cancel'));await waitFor(()=>!joinInput());}
  if (action === 'start') {
    await waitFor(() => find('new meeting'));
    click(find('new meeting'));
    return {ok:true, verifyStarted:true};
  }
  if (action === 'join') {
    click(find('join'));
    await waitFor(joinInput);
    return {ok:true};
  }
  throw new Error('Unknown Zoom home action.');
}
