"""Inventario estático reproducible; no ejecuta SKlauncher ni guarda valores privados."""
import hashlib
import json
import os
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parent
APP = Path(os.environ['LOCALAPPDATA']) / 'Programs/sklauncher'
EXTRACTED = Path.home() / 'Documents/Codex/2026-10-20/qui/work/electron/extracted'
STATE = Path(os.environ['APPDATA']) / '.sklauncher'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def key_name(key):
    if re.fullmatch(r'[0-9a-fA-F-]{32,36}', key):
        return '<id>'
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', key):
        return '<date>'
    return key


def shape(value, depth=0):
    if depth > 5:
        return type(value).__name__
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            safe_key = key_name(key)
            if any(word in key.lower() for word in ('token', 'secret', 'password', 'apikey')):
                result[safe_key] = '<sensitive-value-omitted>'
            else:
                result[safe_key] = shape(item, depth + 1)
        return result
    if isinstance(value, list):
        variants = []
        for item in value:
            candidate = shape(item, depth + 1)
            if candidate not in variants:
                variants.append(candidate)
        return {'type': 'array', 'item_shapes': variants}
    return 'null' if value is None else type(value).__name__


assert shape({'username': 'PRIVATE', 'accessToken': 'SECRET'}) == {
    'username': 'str', 'accessToken': '<sensitive-value-omitted>'}
assert key_name('00000000-0000-0000-0000-000000000000') == '<id>'
assert key_name('2026-10-20') == '<date>'

asar = APP / 'resources/app.asar'
with asar.open('rb') as stream:
    prefix = stream.read(16)
    size_size, header_size, object_size, json_size = struct.unpack('<4I', prefix)
    assert size_size == 4 and json_size <= object_size <= header_size
    header = json.loads(stream.read(json_size))
    data_offset = 8 + header_size
    members = []

    def visit(tree, parent=''):
        for name, info in tree.get('files', {}).items():
            path = f'{parent}/{name}'.lstrip('/')
            if 'files' in info:
                visit(info, path)
            else:
                members.append((path, info))

    visit(header)
    verified = []
    for path, info in members:
        if path == 'package.json' or (path.startswith('out/') and Path(path).suffix in ('.js', '.html', '.json')):
            local = EXTRACTED / path
            if not local.is_file() or 'offset' not in info:
                raise RuntimeError(f'Application member not verified: {path}')
            stream.seek(data_offset + int(info['offset']))
            shipped = hashlib.sha256(stream.read(info['size'])).hexdigest()
            assert shipped == digest(local), f'Extraction mismatch: {path}'
            verified.append({'path': path, 'bytes': info['size'], 'sha256': shipped})

package = json.loads((EXTRACTED / 'package.json').read_text(encoding='utf-8'))
renderer = EXTRACTED / 'out/renderer/assets/index-C44oHH58.js'
text = renderer.read_text(encoding='utf-8')
navigation = sorted(set(re.findall(r'id:"([A-Za-z]+)",label:"nav_[a-z_]+"', text)))
settings = sorted(set(re.findall(r'id:"([A-Za-z]+)",name:"settings_section_[a-z_]+"', text)))
main = (EXTRACTED / 'out/main/index.js').read_text(encoding='utf-8')
urls = re.findall(r'https?://[^\s"\x27`<>\\)\]}]+', main)
from urllib.parse import urlsplit
domains = sorted({urlsplit(url).hostname for url in urls if urlsplit(url).hostname})
schemas = {}
for name in ('settings.json', 'accounts.json', 'instances.json', 'quick_play.json',
             'window-state.json', 'updater-state.json'):
    schemas[name] = shape(json.loads((STATE / name).read_text(encoding='utf-8-sig')))
artifacts = [APP / 'sklauncher.exe', asar,
             Path(os.environ['APPDATA']) / 'sklauncher/SKlauncher.jar',
             STATE / 'sklauncher-fx.jar',
             Path(os.environ['APPDATA']) / '.minecraft/sklauncher-fx.jar']
report = {
    'method': 'Python stdlib, supplementary to REA; static observations only',
    'version': package['version'],
    'artifacts': [{'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)}
                  for path in artifacts if path.is_file()],
    'asar_regular_members': len(members),
    'verified_application_members': verified,
    'dependencies_declared': package['dependencies'],
    'navigation_literal_ids': navigation,
    'settings_literal_ids': settings,
    'main_literal_url_hosts': domains,
    'private_state_shapes_only': schemas,
    'limits': [
        'Literal navigation and host inventory is not a proof of runtime reachability.',
        'Dependency manifest ranges are declarations, not exact installed versions.',
        'No private state values are retained; dynamic map keys are normalized.',
        'Verified extracted application JavaScript and HTML only; CSS, images, fonts and dependency files are not verified here.'
    ]
}
(ROOT / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'version': package['version'], 'asar_members': len(members),
                  'application_members_verified': len(verified),
                  'navigation': navigation, 'settings': settings, 'hosts': domains}))
