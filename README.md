# Zoom Controls for Omarchy

Zoom meeting controls in your Omarchy bar, with Start and Join when you are out
of a meeting. Supports the **English Zoom web app in Chromium**, on Omarchy 4.
The native Zoom desktop application is not supported.

![Zoom Controls meeting menu](preview.png)

- In a meeting: copy invite link, mute/unmute, camera on/off, share/stop sharing,
  chat, participants, show Zoom, and leave.
- Outside a meeting: Start meeting, Join meeting (link or ID), Open Zoom, and
  Join copied meeting when the clipboard contains a supported Zoom link.
- Live microphone, camera, and sharing labels; keyboard navigation with arrows
  or j/k, Enter to activate, and Escape to dismiss.
- Leave completes Zoom's confirmation and verifies departure. It never selects
  End Meeting for All. If Zoom requires a host transfer, finish that in Zoom.
- Sharing opens your normal desktop picker. You choose the content there.

## Install

Dependencies: Omarchy 4 (Quickshell shell), Chromium, Node.js 22+, `uwsm`,
`hyprctl`, `iproute2` (`ss`), `util-linux` (`flock`), `wl-clipboard`, and a
working systemd user session. The standalone installer also needs Python 3.
Install missing packages using Omarchy's package
manager. No npm packages, Zoom API keys, or browser extensions are required.

From this repository's root, run:

```sh
./install
```

The installer validates and enables `jkarmel.zoom-controls`, keeps a backup of
an existing widget, and leaves your preferences and browser data intact. When
updating, Omarchy can retain old QML code; run `omarchy restart shell` if needed.
Open the camera icon and choose **Open Zoom**, then sign in once.

The default launcher uses a dedicated profile at
`~/.local/share/zoom-controls/chromium` (respects `XDG_DATA_HOME`). Normal browser
profiles are unaffected. The helper lives inside the plugin; no global helper
installation is needed. Marketplace installs can load the root manifest directly.

## Keep your preferred launcher

Optional settings: `~/.config/zoom-controls/config.json` (respects
`XDG_CONFIG_HOME`). Example:

```json
{
  "profile": "~/path/to/dedicated-zoom-profile",
  "launcher": ["~/bin/my-zoom-launcher", "show"],
  "clipboardCommand": ["~/bin/my-persistent-clipboard-helper"]
}
```

Omit these settings to use the included defaults. `browser` can select a
Chromium-compatible executable. Commands are argument arrays, never shell code;
`~` is expanded at the start of paths. A custom launcher must use the configured
profile, expose a loopback DevTools listener (`--remote-debugging-port=0`), and
show the existing meeting window without creating duplicate windows. The
clipboard command receives the invite URL on stdin and must retain ownership
after returning. `ZOOM_CONTROLS_CONFIG` selects an alternate config for testing.

## Remove

```sh
./install --remove
```

This disables and removes the widget, retaining preferences and Zoom login data.
You can also disable it with `omarchy plugin disable jkarmel.zoom-controls`.
For an installation made directly by the marketplace, use its removal controls.

## Privacy and limits

The helper connects only to loopback listeners owned by the browser process
using the configured dedicated profile. It reads visible Zoom controls and
rechecks meeting identity before actions. Multiple simultaneous meetings are
reported as ambiguous. Status polling does not focus Zoom or toggle controls.

Remote debugging lets local processes control that dedicated browser profile;
use it for Zoom rather than general browsing. Copied links can contain meeting
passcodes. Status includes only a boolean for clipboard-link availability, not
the URL; clipboard contents are revalidated on click. The built-in clipboard
helper uses a private temporary runtime file until clipboard ownership ends.
Your desktop clipboard history may retain copied links under its own settings.

Zoom UI changes can require selector updates. Waiting rooms, sign-in, meeting
passcodes, host transfer, and other Zoom prompts remain in Zoom. "Opening
meeting" means navigation began, not that admission to the meeting succeeded.
Meeting IDs must contain 9–11 digits. Supported links are HTTPS `zoom.us` links
using `/j/ID`, `/wc/join/ID`, or `/my/name`.

## Development

Run `./check` for backend, parser, installer, and QML tests. QML tests render
without opening desktop windows; the software renderer does not validate native
screen pickers. The tests need Chromium and Qt Quick Test tools. See
[QA results](docs/QA.md) for live coverage and remaining limitations.

IPC:

```sh
omarchy-shell zoom-controls status
omarchy-shell zoom-controls actions
omarchy-shell zoom-controls toggle
```

`actions` reports rows loaded by the running menu, useful for verifying updates.
