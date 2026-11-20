"""Prepare a static hosting folder containing runtime files only, never credentials."""
import shutil
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FILES=['index.html','style.css','app.js','geo.js','manifest.webmanifest','sw.js','experience.js','experience.css']
DIRS=['assets','data','vendor','audio']

def build():
    target=ROOT/'release'
    if target.resolve().parent!=ROOT:
        raise ValueError('Unexpected release path')
    if target.exists():
        shutil.rmtree(target)
    target.mkdir()
    for name in FILES:
        shutil.copy2(ROOT/name,target/name)
    for name in DIRS:
        if (ROOT/name).is_dir():
            shutil.copytree(ROOT/name,target/name,ignore=shutil.ignore_patterns('*.tmp'))
    with zipfile.ZipFile(ROOT/'ryadom-mobile.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in target.rglob('*'):
            if file.is_file():archive.write(file,file.relative_to(target))
    print('Prepared release/ and ryadom-mobile.zip. No publication performed.')

if __name__=='__main__':build()
