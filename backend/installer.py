"""Descriptor-anchored, no-follow install/remove transactions for Zoom Controls."""
import argparse
import contextlib
import ctypes
import fcntl
import importlib.util
import os
from pathlib import Path
import stat
import uuid

SOURCE = Path(__file__).resolve().parents[1]
PLUGIN = 'jkarmel.zoom-controls'
MARKER = '.zoom-controls-install'
FILES = ('manifest.json', 'ZoomPanel.qml', 'MenuContent.qml', 'MenuModel.js',
         'README.md', 'LICENSE', 'preview.png', 'backend', 'bin', 'docs')
spec = importlib.util.spec_from_file_location('zoom_runtime', Path(__file__).with_name('runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def trusted(info, directory=False):
    sticky = directory and info.st_uid == 0 and info.st_mode & stat.S_ISVTX
    if info.st_uid not in (0, os.getuid()) or (info.st_mode & 0o022 and not sticky):
        raise ValueError('Untrusted ownership or writable directory/file')


@contextlib.contextmanager
def directory(path, create=False):
    """Hold each parent until the next no-follow directory open succeeds."""
    path = Path(path).absolute()
    fd = os.open('/', DIR_FLAGS)
    try:
        for part in path.parts[1:]:
            if part in ('.', '..'):
                raise ValueError('Relative directory traversal is not allowed')
            if create:
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            child = os.open(part, DIR_FLAGS, dir_fd=fd)
            try:
                trusted(os.fstat(child), directory=True)
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        yield fd
    finally:
        os.close(fd)


def identity(info):
    return info.st_dev, info.st_ino


def matches(parent, name, fd):
    try:
        return identity(os.stat(name, dir_fd=parent, follow_symlinks=False)) == identity(os.fstat(fd))
    except FileNotFoundError:
        return False


def rename_noreplace(parent, name, destination, new_name):
    """Linux renameat2 refuses to clobber an entry inserted during a race."""
    libc = ctypes.CDLL(None, use_errno=True)
    call = libc.renameat2
    call.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint)
    call.restype = ctypes.c_int
    if call(parent, os.fsencode(name), destination, os.fsencode(new_name), 1):
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def move(parent, name, destination, new_name, fd):
    if not matches(parent, name, fd):
        raise ValueError('Directory changed during the transaction; refusing to move it')
    rename_noreplace(parent, name, destination, new_name)
    if not matches(destination, new_name, fd):
        # Never inspect or delete a replacement. Restore it only if its old
        # name is still empty; otherwise retain both for recovery.
        rename_noreplace(destination, new_name, parent, name)
        raise ValueError('Directory swapped during rename; no contents removed')


def read_file(parent, name, limit=8 * 1024 * 1024):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('Expected a regular source/marker file')
        trusted(info)
        data = stream.read(limit + 1)
        if len(data) > limit:
            raise ValueError('Source/marker file exceeds its size limit')
        return data, info.st_mode


def write_file(parent, name, data, mode=0o600):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=parent)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def copy_tree(source, target, names=None):
    for name in os.listdir(source) if names is None else names:
        if name == '__pycache__' or name.endswith('.pyc'):
            continue
        info = os.stat(name, dir_fd=source, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            child = os.open(name, DIR_FLAGS, dir_fd=source)
            try:
                trusted(os.fstat(child), directory=True)
                if not matches(source, name, child):
                    raise ValueError('Source directory changed')
                os.mkdir(name, 0o700, dir_fd=target)
                out = os.open(name, DIR_FLAGS, dir_fd=target)
                try:
                    copy_tree(child, out)
                finally:
                    os.close(out)
            finally:
                os.close(child)
        elif stat.S_ISREG(info.st_mode):
            data, mode = read_file(source, name)
            write_file(target, name, data, 0o600 | (mode & 0o111))
        else:
            raise ValueError('Links and special files are not allowed in a plugin')


def remove_contents(fd):
    """Delete through the retained directory, never through a symlink."""
    for name in os.listdir(fd):
        info = os.stat(name, dir_fd=fd, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            child = os.open(name, DIR_FLAGS, dir_fd=fd)
            try:
                if identity(info) != identity(os.fstat(child)):
                    raise ValueError('Directory changed before removal')
                remove_contents(child)
                if not matches(fd, name, child):
                    raise ValueError('Directory changed during removal')
                os.rmdir(name, dir_fd=fd)
            finally:
                os.close(child)
        else:
            os.unlink(name, dir_fd=fd)


def owned(parent):
    try:
        fd = os.open(PLUGIN, DIR_FLAGS, dir_fd=parent)
    except FileNotFoundError:
        return None
    try:
        info = os.fstat(fd)
        if info.st_uid != os.getuid():
            raise ValueError('Plugin directory must belong to the current user')
        trusted(info, directory=True)
        marker, _ = read_file(fd, MARKER, 32)
        if marker != b'1\n':
            raise ValueError('Unrecognized installation; refusing to replace/remove it')
        return fd
    except BaseException:
        os.close(fd)
        raise


class Commands:
    def __init__(self, remove=False):
        names = ['omarchy'] if remove else ['python3', 'node', 'chromium', 'uwsm-app',
                 'hyprctl', 'ss', 'wl-copy', 'wl-paste', 'systemd-run', 'systemctl', 'omarchy']
        self.tools = {name: runtime.executable(name) for name in names}
        self.env = dict(runtime.environment(), OMARCHY_PATH='/usr/share/omarchy')
        if not remove:
            version = self.run('node', '-p', 'process.versions.node').decode().strip()
            if int(version.split('.')[0]) < 22:
                raise ValueError('Node.js 22 or newer is required')

    def run(self, name, *args, cwd=None, pass_fds=()):
        code, output = runtime.supervise([self.tools[name], *args], 20, 65536,
                                        env=self.env, cwd=cwd, pass_fds=pass_fds)
        if code:
            raise RuntimeError(f'{name} {args[0] if args else ""} failed (exit {code})')
        return output


def transaction(source, config, commands, remove=False, files_only=False):
    plugins = Path(config) / 'omarchy/plugins'
    with directory(plugins, create=True) as parent:
        lock = os.open('.zoom-controls-install.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=parent)
        with os.fdopen(lock, 'wb') as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ValueError('Installer lock is not a regular file')
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            current = owned(parent)
            if remove and current is None:
                return
            work_name = '.zoom-controls-stage-' + uuid.uuid4().hex
            os.mkdir(work_name, 0o700, dir_fd=parent)
            work = os.open(work_name, DIR_FLAGS, dir_fd=parent)
            candidate = None
            try:
                if remove:
                    if not files_only:
                        commands.run('omarchy', 'plugin', 'disable', PLUGIN)
                    move(parent, PLUGIN, work, 'previous', current)
                    remove_contents(current)
                    if not matches(work, 'previous', current):
                        raise ValueError('Removal target changed; retaining recovery directory')
                    os.rmdir('previous', dir_fd=work)
                    return
                os.mkdir('candidate', 0o700, dir_fd=work)
                candidate = os.open('candidate', DIR_FLAGS, dir_fd=work)
                with directory(source) as original:
                    copy_tree(original, candidate, FILES)
                write_file(candidate, MARKER, b'1\n')
                commands.run('omarchy', 'plugin', 'validate', '.',
                             cwd='/proc/self/fd/' + str(candidate), pass_fds=(candidate,))
                if current is not None:
                    move(parent, PLUGIN, work, 'previous', current)
                try:
                    move(work, 'candidate', parent, PLUGIN, candidate)
                    if not files_only:
                        commands.run('omarchy', 'plugin', 'enable', PLUGIN)
                except BaseException:
                    if matches(parent, PLUGIN, candidate):
                        move(parent, PLUGIN, work, 'failed', candidate)
                    if current is not None:
                        move(work, 'previous', parent, PLUGIN, current)
                    raise
                if current is not None:
                    backup = '.zoom-controls-backup-' + uuid.uuid4().hex
                    move(work, 'previous', parent, backup, current)
                    print('Previous widget backup: ' + str(plugins / backup))
                os.fsync(parent)
            finally:
                try:
                    entries = os.listdir(work)
                    # Never recursively clean an unexpected directory inserted
                    # during a race, or a previous version needed for recovery.
                    cleanable = all(name in ('candidate', 'failed') and candidate is not None
                                    and matches(work, name, candidate) for name in entries)
                    if cleanable:
                        for name in entries:
                            remove_contents(candidate)
                            if not matches(work, name, candidate):
                                raise ValueError('Cleanup target changed; retaining recovery directory')
                            os.rmdir(name, dir_fd=work)
                        if matches(parent, work_name, work):
                            os.rmdir(work_name, dir_fd=parent)
                    else:
                        print('Recovery directory retained: ' + str(plugins / work_name))
                finally:
                    if candidate is not None:
                        os.close(candidate)
                    if current is not None:
                        os.close(current)
                    os.close(work)


def main():
    parser = argparse.ArgumentParser(description='Install/remove Zoom Controls; retain preferences and browser data.')
    parser.add_argument('--remove', action='store_true')
    parser.add_argument('--files-only', action='store_true', help='Skip shell enable/disable; useful for headless installs and preserving existing bar layout')
    args = parser.parse_args()
    os.umask(0o077)
    config = Path(os.environ.get('XDG_CONFIG_HOME') or str(Path.home() / '.config'))
    try:
        transaction(SOURCE, config, Commands(args.remove), args.remove, args.files_only)
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit('Zoom Controls installer: ' + str(error)) from None
    print(('Removed' if args.remove else 'Installed') + ' widget. Preferences and Zoom browser data retained.')
