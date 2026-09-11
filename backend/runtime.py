"""Bounded subprocess execution for the bar and its helpers (Linux/Omarchy)."""
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time

SAFE_PATH = '/usr/bin'
SESSION_KEYS = ('HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'DISPLAY',
                'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME',
                'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME',
                'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'DBUS_SESSION_BUS_ADDRESS',
                'HYPRLAND_INSTANCE_SIGNATURE', 'OMARCHY_REQUEST_WORKSPACE',
                'ZOOM_CONTROLS_CONFIG')


def environment(source=None):
    source = os.environ if source is None else source
    return dict({key: source[key] for key in SESSION_KEYS if key in source},
                PATH=SAFE_PATH)


def executable(value, custom=False):
    """Ignore ambient PATH; explicit user commands are an opt-in trust boundary."""
    path = Path(value) if os.path.isabs(value) else Path(SAFE_PATH) / value
    if not os.path.isabs(value) and ('/' in value or value in ('.', '..')):
        raise ValueError('Commands must be absolute paths or system executable names.')
    path = path.resolve(strict=True)
    allowed = {0, os.getuid()} if custom else {0}
    for item in (path, *path.parents):
        info = item.stat()
        # A root-owned sticky /tmp may contain private test/user directories.
        sticky_root = item != path and info.st_uid == 0 and info.st_mode & stat.S_ISVTX
        if info.st_uid not in allowed or (info.st_mode & 0o022 and not sticky_root):
            raise ValueError('Executable path is writable by an untrusted user.')
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError('Command is not executable.')
    return str(path)


def supervise(argv, timeout, limit, env=None, input_data=None, shared_session=False):
    """Capture a bounded combined stdout/stderr budget and reap the whole group."""
    proc = subprocess.Popen(argv, stdin=None if input_data is None else subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=not shared_session,
                            process_group=0 if shared_session else None,
                            env=environment() if env is None else env)
    old_handlers = {}
    def interrupted(signum, frame):
        raise RuntimeError('Zoom command was interrupted.')
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        old_handlers[sig] = signal.signal(sig, interrupted)
    output = bytearray()
    total = 0
    deadline = time.monotonic() + timeout
    try:
        with selectors.DefaultSelector() as selector:
            for stream in (proc.stdout, proc.stderr):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ)
            pending = memoryview(input_data or b'')
            if proc.stdin:
                os.set_blocking(proc.stdin.fileno(), False)
                selector.register(proc.stdin, selectors.EVENT_WRITE)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Zoom command exceeded its deadline.')
                for key, _ in selector.select(min(remaining, .1)):
                    stream = key.fileobj
                    if stream is proc.stdin:
                        try:
                            count = os.write(stream.fileno(), pending[:4096]) if pending else 0
                            pending = pending[count:]
                        except BrokenPipeError:
                            pending = memoryview(b'')
                        if not pending:
                            selector.unregister(stream)
                            stream.close()
                        continue
                    data = os.read(stream.fileno(), 4096)
                    if not data:
                        selector.unregister(stream)
                        continue
                    total += len(data)
                    if total > limit:
                        raise ValueError('Zoom command exceeded its output limit.')
                    if stream is proc.stdout:
                        output.extend(data)
            try:
                code = proc.wait(timeout=max(.001, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                raise TimeoutError('Zoom command exceeded its deadline.') from None
            return code, bytes(output)
    finally:
        # Kill even on successful parent exit: descendants may hold resources.
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if not shared_session:
            # Inner supervisors use new process groups in this same private
            # session. Reap those too when the outer deadline kills Node.
            for _ in range(10):
                groups = set()
                for entry in Path('/proc').iterdir():
                    if not entry.name.isdigit():
                        continue
                    try:
                        fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
                        if int(fields[3]) == proc.pid and fields[0] != 'Z':
                            groups.add(int(fields[2]))
                    except (OSError, ValueError, IndexError):
                        pass
                if not groups:
                    break
                for group in groups:
                    try:
                        os.killpg(group, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                time.sleep(.01)
        proc.wait()
        for stream in (proc.stdin, proc.stdout, proc.stderr):
            if stream:
                stream.close()
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'resolve':
            print(json.dumps(executable(sys.argv[2], custom=True)))
            sys.exit(0)
        timeout, limit, trust, command, *args = sys.argv[1:]
        command = executable(command, custom=trust == 'user')
        code, output = supervise([command, *args], min(float(timeout), 60), min(int(limit), 1048576), shared_session=True)
        sys.stdout.buffer.write(output)
        sys.exit(code)
    except Exception as error:
        # Never forward child stderr (which can include meeting data).
        print(str(error), file=sys.stderr)
        sys.exit(1)
