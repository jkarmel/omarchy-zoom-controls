"""Persistent Wayland clipboard ownership without a shell or ambient PATH."""
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import uuid
sys.path.insert(0, str(Path(__file__).resolve().parent))
from runtime import environment, executable, supervise


def serve(payload):
    copier = executable('wl-copy')
    fd = os.open(payload, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Clipboard payload must be private.')
        data = stream.read(8193)
    if len(data) > 8192:
        raise ValueError('Clipboard payload is too large.')
    Path(payload).unlink()
    # The service deliberately lives until clipboard ownership ends. Its only
    # child is the validated system wl-copy, with a clean environment and no
    # command/clipboard data in argv or logs.
    import subprocess
    proc = subprocess.Popen([copier, '--type', 'text/plain', '--foreground'],
                            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, env=environment())
    try:
        proc.communicate(data)
        return proc.returncode
    finally:
        if proc.poll() is None:
            proc.kill()
        proc.wait()


def copy(data):
    if not data or len(data) > 8192:
        raise ValueError('Invalid clipboard payload size.')
    tools = {name: executable(name) for name in ('python3','systemd-run','systemctl','wl-paste')}
    runtime = Path(os.environ.get('XDG_RUNTIME_DIR', '/run/user/' + str(os.getuid())))
    info = runtime.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Clipboard runtime directory must be private.')
    unit = 'zoom-controls-clipboard-' + uuid.uuid4().hex
    payload = None
    success = False
    try:
        fd, payload = tempfile.mkstemp(prefix='zoom-controls-clipboard.', dir=runtime)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        code, _ = supervise([tools['systemd-run'],'--user','--quiet','--collect','--unit='+unit,
                             '--property=Type=exec', '--property=UMask=0077',
                             '--property=UnsetEnvironment=LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT PYTHONPATH PYTHONHOME BASH_ENV ENV NODE_OPTIONS',
                             *['--setenv='+key+'='+value for key,value in environment().items()],
                             tools['python3'],'-I',str(Path(__file__).resolve()),'--serve',payload], 2, 8192)
        if code:
            raise RuntimeError('Could not start clipboard ownership.')
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                code, actual = supervise([tools['wl-paste'],'--no-newline'], .5, 8192)
            except TimeoutError:
                continue
            if code == 0 and actual == data:
                success = True
                return
            time.sleep(.1)
        raise RuntimeError('Clipboard verification failed.')
    finally:
        if payload:
            Path(payload).unlink(missing_ok=True)
        if not success:
            # Also stop if systemd accepted the request just before a timeout.
            try:
                supervise([tools['systemctl'],'--user','stop',unit], 2, 8192)
            except Exception:
                pass


def main():
    def interrupted(signum, frame):
        raise RuntimeError('Clipboard action was interrupted.')
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, interrupted)
    if len(sys.argv) == 3 and sys.argv[1] == '--serve':
        return serve(sys.argv[2])
    copy(sys.stdin.buffer.read(8193))
    return 0


if __name__ == '__main__':
    # -I deliberately excludes the script directory from sys.path.
    sys.exit(main())
