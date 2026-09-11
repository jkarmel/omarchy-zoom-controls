import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from runtime import environment, executable, supervise


class SupervisorTests(unittest.TestCase):
    def test_environment_and_path_hijack(self):
        with tempfile.TemporaryDirectory() as tmp:
            fake=Path(tmp)/'ss'; fake.write_text('#!/bin/sh\nexit 77\n');fake.chmod(0o755)
            prior=os.environ.get('PATH')
            try:
                os.environ['PATH']=tmp
                self.assertEqual(executable('ss'), '/usr/bin/ss')
                env=environment({'HOME':'/home/example','PATH':tmp,'NODE_OPTIONS':'bad',
                                 'LD_PRELOAD':'bad','PYTHONPATH':tmp,'BASH_ENV':'bad'})
                self.assertEqual(env, {'HOME':'/home/example','PATH':'/usr/bin'})
            finally: os.environ['PATH']=prior
            self.assertEqual(executable(str(fake),custom=True),str(fake))
            fake.chmod(0o777)
            with self.assertRaises(ValueError): executable(str(fake),custom=True)

    def test_output_flood(self):
        start=time.monotonic()
        with self.assertRaises(ValueError):
            supervise(['/usr/bin/python3','-I','-c','import os\nwhile True: os.write(1,b"x"*4096)'],2,8192)
        self.assertLess(time.monotonic()-start,2)

    def test_stderr_flood(self):
        with self.assertRaises(ValueError):
            supervise(['/usr/bin/python3','-I','-c','import os;os.write(2,b"x"*20000)'],2,8192)

    def test_timeout_kills_descendants(self):
        with tempfile.TemporaryDirectory() as tmp:
            pidfile=Path(tmp)/'pid'
            code='''import os,signal,time,sys
pid=os.fork()
if pid==0:
    signal.signal(signal.SIGTERM,signal.SIG_IGN)
    open(sys.argv[1],'w').write(str(os.getpid()))
    while True: time.sleep(.1)
while True: time.sleep(.1)
'''
            with self.assertRaises(TimeoutError):
                supervise(['/usr/bin/python3','-I','-c',code,str(pidfile)],.3,8192)
            pid=int(pidfile.read_text())
            # A killed orphan may briefly be a zombie until adopted/reaped.
            status=Path(f'/proc/{pid}/stat')
            for _ in range(100):
                try:
                    if not status.exists() or status.read_text().split()[2]=='Z': break
                except (FileNotFoundError, ProcessLookupError):
                    break
                time.sleep(.01)
            else: self.fail('Descendant survived supervisor timeout')

    def test_outer_timeout_kills_nested_supervisor_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            pidfile=Path(tmp)/'pid'
            runtime=str(Path(__file__).resolve().parents[1]/'backend/runtime.py')
            code='import os,time,sys;open(sys.argv[1],"w").write(str(os.getpid()));time.sleep(30)'
            with self.assertRaises(TimeoutError):
                supervise(['/usr/bin/python3','-I',runtime,'20','8192','system',
                           '/usr/bin/python3','-I','-c',code,str(pidfile)],.3,8192)
            pid=int(pidfile.read_text())
            try:
                state=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[0]
                self.assertEqual(state,'Z','Nested process group survived the outer timeout')
            except (FileNotFoundError,ProcessLookupError):
                pass

    def test_stalled_stdin_is_bounded(self):
        with self.assertRaises(TimeoutError):
            supervise(['/usr/bin/python3','-I','-c','import time;time.sleep(10)'],.1,8192,input_data=b'x'*100000)

    def test_success_and_custom_arguments(self):
        code,output=supervise(['/usr/bin/python3','-I','-c','import sys;print(sys.argv[1])','arg with spaces'],1,8192)
        self.assertEqual((code,output),(0,b'arg with spaces\n'))


if __name__=='__main__': unittest.main()
