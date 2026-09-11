# Validation

Tested on Omarchy 4, Qt 6.11.2, Chromium 151 and Node.js 26.
Original live checks: 2026-09-10. Security update checks: 2026-09-11.

## Automated and isolated checks

- DOM fixtures in isolated Chromium: idle/meeting state, microphone/camera
  transitions, disabled controls, stale meeting requests, copy popover cleanup,
  chat/participants, overflow controls, sharing state, and full Leave confirmation.
- Link parsing: IDs, regional links, passcode preservation, and rejection of
  unrelated hosts, credentials in URLs, unsafe schemes, and malformed input.
- Real process discovery: a dedicated Chromium profile whose path contains
  spaces is found; an unrelated profile is rejected.
- Launcher arguments: portable and custom commands preserve argument boundaries.
- Installer: isolated install, upgrade backup, removal, and preference retention.
- Clipboard cleanup: failed input, partial writes, failed service startup, and
  successful handoff are covered without touching the desktop clipboard.
- Qt Quick Test: seven checks passed on offscreen QPA with the software renderer.
  Screenshots of meeting, sharing, idle, and Join were reviewed. These do not
  validate compositor positioning or native chooser behavior.
- Manifest validation and QML lint passed. The portable clipboard helper was
  verified against the live Wayland clipboard after its process returned.

## Live Zoom checks

Passed in solo meetings: Start, mute/unmute, camera on/off, copy invite link,
chat, participants (including More overflow), and Leave. Leave completed the
confirmation and subsequent discovery returned idle. Local launcher/profile
preferences continue to be used by the portable backend.

Sharing passed with the installed menu helper and the desktop picker: the user
selected a window, Zoom reported sharing:true, Stop sharing returned success,
and Zoom reported sharing:false afterward.

Joining passed using Zoom's official test meeting. The installed Join action
opened the generated meeting link and preserved its passcode. Zoom recognized
the signed-in user on its prejoin screen; after joining with microphone and
camera off, discovery reported `Test Zoom Meeting` in the meeting state. Leave
then completed successfully and discovery returned idle.

An earlier isolated headless guest was refused by Zoom's anti-bot check. The
successful signed-in browser check used the normal Join flow; no anti-bot
controls were bypassed. Waiting-room admission and host-transfer cases still
depend on Zoom's normal UI and are not automated by the widget.

Both test meetings were left, and the temporary test tab and QA window were
closed. The user's existing launcher/profile/clipboard overrides remain active.

## Version 1.2.1 review fixes

- Real local HTTP fixture rejects redirects without contacting the redirect
  destination, oversized lists, malformed JSON, excessive targets, and endpoint
  or target-ID mismatches.
- WebSocket tests cover rejection of excessive declared frame sizes before any
  payload arrives, fragmented messages, and malformed CDP responses. All existing
  meeting DOM tests also pass against real headless Chromium through this transport.
- Seven subprocess tests cover environment and PATH injection, unsafe executable
  permissions, stdout/stderr floods, stalled stdin, argument boundaries, timeout
  cleanup, and nested process groups. Children ignoring SIGTERM are still killed.
- Four isolated clipboard tests cover input/write/service failures and handoff.
- A real systemd clipboard service was exercised against a private headless Weston
  desktop. After the helper exited, wl-paste still returned the exact synthetic
  test link. The real desktop clipboard was not changed. Weston was then stopped.
- Current local Zoom discovery returned idle through the bounded wrapper, with the
  existing profile override. Both explicit local helper paths passed validation.
- QML lint, manifest validation, and seven offscreen menu checks passed. This update
  changes process handling, not the menu layout. Live meeting actions from the
  earlier section were not repeated in a new meeting for this update.
