import os,pathlib,subprocess,tempfile,json
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    base=pathlib.Path(tmp);bins=base/'bin';bins.mkdir();cfg=base/'config'
    omarchy=bins/'omarchy';omarchy.write_text('#!/bin/sh\nexit 0\n');omarchy.chmod(0o755)
    env=dict(os.environ,XDG_CONFIG_HOME=str(cfg),PATH=str(bins)+':'+os.environ['PATH'])
    preference=cfg/'zoom-controls/config.json';preference.parent.mkdir(parents=True);preference.write_text('{"profile":"/preferred/profile"}')
    run=lambda *args:subprocess.run([str(root/'install'),*args],env=env,check=True,stdout=subprocess.DEVNULL)
    run();target=cfg/'omarchy/plugins/jkarmel.zoom-controls'
    assert (target/'bin/zoom-controls').stat().st_mode&0o111
    assert json.loads((target/'manifest.json').read_text())['id']=='jkarmel.zoom-controls'
    (target/'prior-marker').write_text('old version')
    run();assert list(target.parent.glob('.zoom-controls-backup-*/prior-marker'))
    run('--remove');assert not target.exists();assert preference.read_text()=='{"profile":"/preferred/profile"}'
print('PASS: isolated install, update backup, removal, preferences retained')
