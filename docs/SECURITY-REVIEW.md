# Marketplace review fixes in 1.2.1

This update addresses the three requests on marketplace submission #6283.

1. **Debug endpoint and input validation.** `protocol.mjs` caps the HTTP body at
   256 KiB, refuses redirects, caps targets at 64, validates schemas, and binds
   each WebSocket to the discovered loopback host/port/protocol and page ID.
   `websocket.mjs` rejects oversized declared frame lengths before waiting for
   bodies, bounds fragmented messages and fragment counts, refuses compression
   and invalid frames, and validates UTF-8. `cdp.mjs` validates bounded messages
   before dispatch and rejects malformed responses without uncaught parsing.

2. **Executable identity and environment.** `runtime.py` resolves system tools
   under `/usr/bin`, follows symlinks, and verifies executable and parent ownership
   and write permissions before launching the resolved absolute path. Explicit
   custom scripts may be owned by the current user. QML and subprocess launchers
   use a session-variable allowlist with a fixed PATH. The clipboard helper is
   Python rather than a shell command; it invokes validated absolute executables,
   keeps payloads out of argv/logs, and removes the temporary file on handoff.
   The service strips loader/startup variables and passes a controlled environment
   to wl-copy. Custom scripts remain explicitly trusted user code.

3. **Deadlines and bounded collection.** The Python wrapper supervises Node in a
   private session, caps combined output at 64 KiB, and enforces an 8-second poll
   or 60-second action deadline. Inner command supervisors enforce smaller budgets,
   including 10 seconds for copying. Cleanup kills the complete process group;
   outer cleanup also kills nested helper groups in its private session. QML has
   separate 10/65-second timers and output checks. Persistent services and browsers
   deliberately launched through the session manager are outside action lifetime.

Validation is documented in [QA.md](QA.md). These changes do not claim to sandbox
custom scripts or prevent an attacker who already controls the user's account.
