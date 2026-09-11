// Runs only in the selected Zoom page. Read UI state; never read Zoom stores/tokens.
export async function zoomPage(action = 'status', expected = '') {
  const docs = [];
  function visit(d) {
    if (!d || docs.includes(d)) return;
    docs.push(d);
    for (const frame of d.querySelectorAll('iframe')) {
      try { if (frame.contentDocument && /(^|\.)zoom\.us$/.test(new URL(frame.src, d.URL).hostname)) visit(frame.contentDocument); } catch {}
    }
  }
  visit(document);
  const visible = e => !!e && e.getClientRects().length > 0 && e.checkVisibility();
  const enabled = e => !!e && !e.disabled && e.getAttribute('aria-disabled') !== 'true';
  const d = docs.find(d => visible(d.querySelector('#wc-footer')) && d.querySelector('#meeting-info-indication'));
  if (!d) return {state: document.querySelector('[title="In a Zoom meeting"]') ? 'unknown' : 'idle', title: document.querySelector('[title="In a Zoom meeting"]') ? 'Meeting controls are loading' : 'No active meeting', capabilities: {}};
  const text = e => (e?.getAttribute('aria-label') || e?.innerText || '').trim();
  const buttons = () => [...d.querySelectorAll('button,[role="button"],[role="menuitem"]')].filter(visible);
  const find = re => buttons().find(e => re.test(text(e)));
  const mic = find(/^(unmute|mute) my microphone$/i);
  const video = find(/^(start|stop) my video$/i);
  const stop = find(/^stop shar(e|ing)$/i);
  const more = () => [...d.querySelectorAll('#wc-footer button')].find(e => visible(e) && /^More$/i.test(e.innerText.trim()));
  const info = d.querySelector('#meeting-info-indication');
  const title = info.innerText.trim() || d.title || 'Zoom meeting';
  const meeting = new URL(d.URL).pathname + '|' + title;
  const state = {state:'meeting', title, meeting,
    muted:mic ? /^unmute/i.test(text(mic)) : null,
    cameraOn:video ? /^stop/i.test(text(video)) : null,
    sharing:!!stop,
    capabilities:{mic:enabled(mic), video:enabled(video), copy:enabled(info), share:enabled(stop) || enabled(find(/^(share|share screen|share my screen)$/i)) || enabled(more()), chat:enabled(find(/^(open|close) the chat panel/i)) || enabled(more()), participants:enabled(find(/manage participants|participants list/i)) || enabled(more()), leave:!!find(/^(end|leave)$/i)}};
  if (action === 'status') return state;
  if (!expected || expected !== meeting) throw new Error('The meeting changed. Reopen the Zoom menu.');
  function click(e) {if (!visible(e) || !enabled(e)) throw new Error('This control is unavailable in Zoom right now.');e.click()}
  async function waitFor(fn) {for(let i=0;i<60;i++){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,50))}throw new Error('Zoom did not show the requested control.')}
  if (action === 'leave') {
    // Reuse an already-open leave menu; never choose End Meeting for All.
    let leave = find(/^leave meeting$/i);
    if (!leave) {
      click(find(/^(end|leave)$/i));
      leave = await waitFor(() => find(/^leave meeting$/i));
    }
    click(leave);
    // Navigation may destroy this execution context. The caller verifies that
    // this exact meeting has disappeared before reporting success.
    return {ok:true, verifyLeft:true};
  }
  if (action === 'copy') {
    const selector='.meeting-info-icon__meeting-url';
    const opened=!visible(d.querySelector(selector));
    try {
      if(opened) click(info);
      const field=await waitFor(()=>{const e=d.querySelector(selector);return visible(e)&&e});
      const url=new URL(field.innerText.trim());
      if(url.protocol!=='https:' || !/(^|\.)zoom\.us$/.test(url.hostname) || !/^\/j\/\d+/.test(url.pathname))throw new Error('Zoom did not provide an invite link.');
      return {ok:true, link:url.href};
    } finally {if(opened && visible(d.querySelector(selector))) info.click()}
  }
  const panelSelectors = {chat:'.chat-container', participants:'.participants-section-container'};
  const directPatterns = {share:/^(share|share screen|share my screen)$/i, chat:/^(open|close) the chat panel/i, participants:/manage participants|participants list/i};
  const overflowPatterns = {share:directPatterns.share, chat:/^chat$/i, participants:/^participants(?:\s*\(\d+\))?$/i};
  const panelVisible = () => !![...d.querySelectorAll(panelSelectors[action] || ':not(*)')].find(visible);
  const wasPanelVisible = panelVisible();
  const previousLabel = text(find(directPatterns[action] || /$a/));
  if (action in directPatterns) {
    if(action === 'share' && stop) throw new Error('Already sharing. Use Stop sharing first.');
    let button = find(directPatterns[action]) || find(overflowPatterns[action]);
    let opened = false;
    try {
      if (!button) {
        click(more());
        opened = true;
        button = await waitFor(() => find(directPatterns[action]) || find(overflowPatterns[action]));
      }
      click(button);
    } catch (e) {
      if (opened && visible(d.querySelector('.more-button__pop-menu.show'))) more()?.click();
      throw e;
    }
    if (action in panelSelectors) {
      await waitFor(() => {
        const label = text(find(directPatterns[action]));
        return panelVisible() !== wasPanelVisible || (previousLabel && label && label !== previousLabel);
      });
    }
    // Sharing deliberately opens the native source picker: only the user can
    // choose which content to expose. Status reports sharing after it starts.
    return {ok:true, ...(action === 'share' ? {pickerRequested:true} : {})};
  }
  const specific={mute:()=>/^mute/i.test(text(mic))&&mic,unmute:()=>/^unmute/i.test(text(mic))&&mic,
    'camera-on':()=>/^start/i.test(text(video))&&video,'camera-off':()=>/^stop/i.test(text(video))&&video,
    'stop-share':()=>stop};
  if (!specific[action]) throw new Error('Unknown Zoom action.');
  const button = specific[action]();
  if (!button) throw new Error('Zoom state changed. The menu has been refreshed.');
  click(button);
  await waitFor(()=>action==='stop-share' ? !find(/^stop shar(e|ing)$/i) : action==='mute' ? !!find(/^unmute my microphone$/i) : action==='unmute' ? !!find(/^mute my microphone$/i) : action==='camera-on' ? !!find(/^stop my video$/i) : !!find(/^start my video$/i));
  return {ok:true};
}
