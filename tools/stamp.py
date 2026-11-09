#!/usr/bin/env python3
"""Run before every commit:  python3 tools/stamp.py
- refuses to ship if the plan engine checks fail (node tools/test-engine.mjs)
- index.html: every local config.js / styles.css / js/*.js tag gets ?v=<hash of that file>
- sw.js: cache name V = hash of everything served, SHELL precaches the stamped files
"""
import hashlib, pathlib, re, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
if shutil.which("node") and subprocess.run(["node", "tools/test-engine.mjs"], cwd=ROOT).returncode:
    sys.exit("stamp: fix the plan engine problems above first")
h = lambda b: hashlib.sha1(b).hexdigest()[:10]
index = ROOT / "index.html"
html = index.read_text(encoding="utf-8")
html = re.sub(r'((?:src|href)=")((?:js/[\w.-]+\.js)|styles\.css|config\.js)\?v=\w*', lambda m: f'{m.group(1)}{m.group(2)}?v={h((ROOT / m.group(2)).read_bytes())}', html)
index.write_text(html, encoding="utf-8")
assets = re.findall(r'(?:src|href)="((?:js/[\w.-]+\.js|styles\.css|config\.js)\?v=\w+)"', html)
served = [index, ROOT / "manifest.webmanifest"] + [ROOT / a.split("?")[0] for a in assets]
version = h(b"".join(p.read_bytes() for p in served))
sw = ROOT / "sw.js"
src = sw.read_text(encoding="utf-8")
src = re.sub(r'const V = "af-\w*";', f'const V = "af-{version}";', src)
shell = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"] + ["./" + a for a in assets]
src = re.sub(r'const SHELL = \[.*?\];', "const SHELL = " + str(shell).replace("'", '"') + ";", src)
sw.write_text(src, encoding="utf-8")
print(f"stamped: sw af-{version}, {len(assets)} app files")
