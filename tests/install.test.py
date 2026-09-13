"""Installer regression tests: all mutations use temporary config/source trees."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', ROOT/'backend/installer.py')
i = importlib.util.module_from_spec(spec)
spec.loader.exec_module(i)


class Installer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.cfg = self.base/'config'
        self.plugins = self.cfg/'omarchy/plugins'
        self.target = self.plugins/i.PLUGIN
        self.pref = self.cfg/'zoom-controls/config.json'
        self.pref.parent.mkdir(parents=True)
        self.pref.write_text('{"profile":"/preferred/profile"}')
        self.commands = i.Commands()
        self.addCleanup(lambda: self.assertEqual(self.pref.read_text(), '{"profile":"/preferred/profile"}'))
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.addCleanup(self.output.__exit__, None, None, None)

    def install(self, **kwargs):
        i.transaction(ROOT, self.cfg, self.commands, files_only=True, **kwargs)

    def test_real_install_upgrade_remove(self):
        self.install()
        self.assertTrue((self.target/'bin/zoom-controls').stat().st_mode & 0o100)
        self.assertEqual(json.loads((self.target/'manifest.json').read_text())['id'], i.PLUGIN)
        (self.target/'prior-marker').write_text('old')
        self.install()
        self.assertEqual(len(list(self.plugins.glob('.zoom-controls-backup-*/prior-marker'))), 1)
        self.install(remove=True)
        self.assertFalse(self.target.exists())
        self.assertFalse(list(self.plugins.glob('.zoom-controls-stage-*')))

    def test_hostile_path_and_startup_environment(self):
        bins=self.base/'bin';bins.mkdir();sentinel=self.base/'executed'
        for name in ['omarchy','node','python3']:
            tool=bins/name;tool.write_text('#!/bin/sh\ntouch '+str(sentinel)+'\nexit 19\n');tool.chmod(0o700)
        startup=self.base/'startup';startup.write_text('touch '+str(sentinel)+'\n')
        env=dict(os.environ,PATH=str(bins),BASH_ENV=str(startup),PYTHONPATH=str(bins),XDG_CONFIG_HOME=str(self.cfg))
        p=subprocess.run([str(ROOT/'install'),'--files-only'],env=env,capture_output=True,timeout=25)
        self.assertEqual(p.returncode,0,p.stderr.decode())
        self.assertFalse(sentinel.exists())
        self.assertTrue((self.target/'manifest.json').exists())
        self.assertEqual(self.commands.tools['omarchy'],i.runtime.executable('omarchy'))
        self.assertNotIn('BASH_ENV',self.commands.env)

    def test_validated_system_tool_identity(self):
        rogue=self.base/'omarchy';rogue.write_text('#!/bin/sh\n');rogue.chmod(0o700)
        with self.assertRaises(ValueError):i.runtime.executable(str(rogue))

    def test_config_ancestor_symlink(self):
        outside=self.base/'outside';outside.mkdir()
        (self.cfg/'omarchy').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(OSError):self.install()
        self.assertEqual(list(outside.iterdir()),[])

    def test_target_symlink_on_install_and_remove(self):
        self.plugins.mkdir(parents=True)
        outside=self.base/'outside';outside.mkdir();(outside/i.MARKER).write_text('1\n')
        sentinel=outside/'keep';sentinel.write_text('keep')
        self.target.symlink_to(outside,target_is_directory=True)
        for remove in (False,True):
            with self.assertRaises(OSError):self.install(remove=remove)
        self.assertEqual(sentinel.read_text(),'keep')

    def test_unmarked_installation_preserved(self):
        self.target.mkdir(parents=True);(self.target/'keep').write_text('keep')
        for remove in (False,True):
            with self.assertRaises(OSError):self.install(remove=remove)
        self.assertEqual((self.target/'keep').read_text(),'keep')

    def test_marker_symlink_and_fifo(self):
        self.target.mkdir(parents=True)
        outside=self.base/'marker';outside.write_text('1\n')
        marker=self.target/i.MARKER;marker.symlink_to(outside)
        with self.assertRaises(OSError):self.install(remove=True)
        marker.unlink();os.mkfifo(marker)
        with self.assertRaises(ValueError):self.install(remove=True)
        self.assertTrue(marker.exists())

    def test_source_link_rejected(self):
        source=self.base/'source';shutil.copytree(ROOT,source,ignore=shutil.ignore_patterns('.git','build','__pycache__'))
        (source/'README.md').unlink();(source/'README.md').symlink_to(ROOT/'README.md')
        with self.assertRaises(ValueError):i.transaction(source,self.cfg,self.commands,files_only=True)
        self.assertFalse(self.target.exists())

    def test_validation_failure_preserves_old_version(self):
        self.install();(self.target/'keep').write_text('old')
        with patch.object(self.commands,'run',side_effect=RuntimeError('validation failed')):
            with self.assertRaises(RuntimeError):self.install()
        self.assertEqual((self.target/'keep').read_text(),'old')
        self.assertFalse(list(self.plugins.glob('.zoom-controls-stage-*')))

    def test_enable_failure_rolls_back(self):
        self.install();(self.target/'keep').write_text('old')
        real=self.commands.run
        def run(name,*args,**kwargs):
            if args[:2]==('plugin','enable'):raise RuntimeError('enable failed')
            return real(name,*args,**kwargs)
        with patch.object(self.commands,'run',side_effect=run):
            with self.assertRaises(RuntimeError):i.transaction(ROOT,self.cfg,self.commands)
        self.assertEqual((self.target/'keep').read_text(),'old')

    def test_disable_failure_preserves_files(self):
        self.install()
        with patch.object(self.commands,'run',side_effect=RuntimeError('disable failed')):
            with self.assertRaises(RuntimeError):i.transaction(ROOT,self.cfg,self.commands,remove=True)
        self.assertTrue((self.target/'manifest.json').exists())

    def test_swapped_config_directory_stays_anchored(self):
        self.install();outside=self.base/'outside';outside.mkdir()
        real=self.commands.run
        def run(name,*args,**kwargs):
            if args[:2]==('plugin','validate'):
                self.plugins.rename(self.cfg/'omarchy/original')
                self.plugins.symlink_to(outside,target_is_directory=True)
            return real(name,*args,**kwargs)
        with patch.object(self.commands,'run',side_effect=run):self.install()
        self.assertEqual(list(outside.iterdir()),[])
        self.assertTrue((self.cfg/'omarchy/original'/i.PLUGIN/'manifest.json').exists())

    def test_swapped_target_before_claim_is_not_removed(self):
        self.install();real=i.move;old=self.plugins/'original'
        def move(parent,name,dest,new,fd):
            if name==i.PLUGIN:
                self.target.rename(old);self.target.mkdir();(self.target/'keep').write_text('replacement')
            return real(parent,name,dest,new,fd)
        with patch.object(i,'move',side_effect=move):
            with self.assertRaises(ValueError):self.install(remove=True)
        self.assertEqual((self.target/'keep').read_text(),'replacement')
        self.assertTrue((old/'manifest.json').exists())

    def test_swap_during_rename_detected_without_deleting_replacement(self):
        self.install();real=i.rename_noreplace;old=self.plugins/'original';triggered=False
        def rename(parent,name,dest,new):
            nonlocal triggered
            if name==i.PLUGIN and not triggered:
                triggered=True;self.target.rename(old);self.target.mkdir();(self.target/'keep').write_text('replacement')
            return real(parent,name,dest,new)
        with patch.object(i,'rename_noreplace',side_effect=rename):
            with self.assertRaises(ValueError):self.install(remove=True)
        self.assertEqual((self.target/'keep').read_text(),'replacement')
        self.assertTrue((old/'manifest.json').exists())

    def test_destination_race_does_not_overwrite_new_entry(self):
        self.install();real=i.move
        def move(parent,name,dest,new,fd):
            if name=='candidate':
                self.target.mkdir();(self.target/'keep').write_text('replacement')
            return real(parent,name,dest,new,fd)
        with patch.object(i,'move',side_effect=move):
            with self.assertRaises(FileExistsError):self.install()
        self.assertEqual((self.target/'keep').read_text(),'replacement')
        self.assertTrue(list(self.plugins.glob('.zoom-controls-stage-*/previous/manifest.json')))

    def test_remove_nested_symlink_keeps_external_files(self):
        self.install();outside=self.base/'outside';outside.mkdir();(outside/'keep').write_text('keep')
        (self.target/'external').symlink_to(outside,target_is_directory=True)
        self.install(remove=True)
        self.assertEqual((outside/'keep').read_text(),'keep')

    def test_swapped_candidate_is_retained_not_cleaned(self):
        self.install();(self.target/'keep').write_text('old')
        real=i.rename_noreplace;triggered=False
        def rename(parent,name,dest,new):
            nonlocal triggered
            if name=='candidate' and not triggered:
                triggered=True
                os.rename('candidate','original-candidate',src_dir_fd=parent,dst_dir_fd=parent)
                os.mkdir('candidate',0o700,dir_fd=parent)
                fake=os.open('candidate',i.DIR_FLAGS,dir_fd=parent)
                try:i.write_file(fake,'keep',b'replacement')
                finally:os.close(fake)
            return real(parent,name,dest,new)
        with patch.object(i,'rename_noreplace',side_effect=rename):
            with self.assertRaises(ValueError):self.install()
        self.assertEqual((self.target/'keep').read_text(),'old')
        replacement=list(self.plugins.glob('.zoom-controls-stage-*/candidate/keep'))
        self.assertEqual(len(replacement),1)
        self.assertEqual(replacement[0].read_text(),'replacement')

    def test_lock_symlink_and_fifo_rejected(self):
        self.plugins.mkdir(parents=True);outside=self.base/'lock';outside.write_text('keep')
        lock=self.plugins/'.zoom-controls-install.lock';lock.symlink_to(outside)
        with self.assertRaises(OSError):self.install()
        lock.unlink();os.mkfifo(lock)
        with self.assertRaises(OSError):self.install()
        self.assertEqual(outside.read_text(),'keep')

    def test_read_bound_and_special_source(self):
        self.plugins.mkdir(parents=True)
        with i.directory(self.plugins) as fd:
            i.write_file(fd,'large',b'x'*33)
            with self.assertRaises(ValueError):i.read_file(fd,'large',32)
            os.mkfifo('fifo',dir_fd=fd)
            with self.assertRaises(ValueError):i.read_file(fd,'fifo')


if __name__=='__main__':unittest.main(verbosity=2)
