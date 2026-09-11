"""Clipboard failures never touch the desktop or retain the temporary link."""
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import clipboard


class ClipboardCleanupTests(unittest.TestCase):
    def test_input_failure_creates_no_payload(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, XDG_RUNTIME_DIR=tmp):
            with patch.object(clipboard.sys, 'stdin') as stdin:
                stdin.buffer.read.side_effect = OSError('input failed')
                with self.assertRaises(OSError):
                    clipboard.main()
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_partial_write_failure_cleans_payload(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, XDG_RUNTIME_DIR=tmp):
            original = os.fdopen
            class BrokenWriter:
                def __init__(self, fd, mode): self.stream = original(fd, mode)
                def __enter__(self): return self
                def __exit__(self, *args): self.stream.close()
                def write(self, data):
                    self.stream.write(data[:8])
                    raise OSError('partial write failed')
            with patch.object(clipboard.os, 'fdopen', BrokenWriter), patch.object(clipboard, 'supervise', return_value=(0,b'')):
                with self.assertRaises(OSError): clipboard.copy(b'private-test-passcode')
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_service_failure_cleans_payload_and_stops_unit(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, XDG_RUNTIME_DIR=tmp):
            calls=[]
            def run(argv, *args):
                calls.append(argv)
                return (1,b'') if 'systemd-run' in argv[0] else (0,b'')
            with patch.object(clipboard, 'supervise', side_effect=run):
                with self.assertRaises(RuntimeError): clipboard.copy(b'private-test-passcode')
            self.assertTrue(any('systemctl' in argv[0] for argv in calls))
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_success_service_consumes_and_unlinks_payload(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, XDG_RUNTIME_DIR=tmp):
            data=b'https://zoom.us/j/123456789?pwd=test'
            def run(argv, *args):
                if 'systemd-run' in argv[0]:
                    payload=Path(argv[-1])
                    self.assertEqual(payload.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(payload.read_bytes(),data)
                    payload.unlink()
                    return 0,b''
                if 'wl-paste' in argv[0]: return 0,data
                self.fail('Successful handoff should not stop the service')
            with patch.object(clipboard, 'supervise', side_effect=run): clipboard.copy(data)
            self.assertEqual(list(Path(tmp).iterdir()), [])


if __name__ == '__main__': unittest.main()
