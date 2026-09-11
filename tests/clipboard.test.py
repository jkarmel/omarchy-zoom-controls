"""Early clipboard failures must not retain temporary link data."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


HELPER = Path(__file__).resolve().parents[1] / 'bin/copy-link'


class ClipboardCleanupTests(unittest.TestCase):
    def check_failure(self, failing_tool=None, script=None, closed_stdin=False):
        with tempfile.TemporaryDirectory(prefix='zoom-clipboard-test-') as tmp:
            root = Path(tmp)
            runtime = root / 'runtime'
            runtime.mkdir(mode=0o700)
            commands = root / 'bin'
            commands.mkdir()
            # Never start a real service or touch the desktop clipboard.
            service = commands / 'systemd-run'
            service.write_text('#!/bin/bash\ntouch "$XDG_RUNTIME_DIR/service-started"\nexit 99\n')
            service.chmod(0o755)
            if failing_tool:
                stub = commands / failing_tool
                stub.write_text('#!/bin/bash\n' + script + '\n')
                stub.chmod(0o755)
            env = dict(os.environ, XDG_RUNTIME_DIR=str(runtime),
                       PATH=str(commands) + os.pathsep + os.environ['PATH'])
            command = ['bash', str(HELPER)]
            if closed_stdin:
                command = ['bash', '-c', 'exec bash "$1" <&-', '_', str(HELPER)]
            result = subprocess.run(command, input=b'https://zoom.us/j/123456789?pwd=test',
                                    capture_output=True, env=env, timeout=5)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((runtime / 'service-started').exists())
            self.assertEqual(list(runtime.iterdir()), [], 'Temporary link data remained after failure')

    def test_closed_input(self):
        self.check_failure(closed_stdin=True)

    def test_partial_input_failure(self):
        self.check_failure('cat', "printf '%s' 'partial-meeting-passcode'; exit 1")

    def test_permission_setup_failure(self):
        self.check_failure('chmod', 'exit 1')


if __name__ == '__main__':
    unittest.main()
