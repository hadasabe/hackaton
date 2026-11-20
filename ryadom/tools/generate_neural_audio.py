"""Generate reusable Denis recordings with the approved workspace-only Piper runtime.

No service requests, account, package installation or core manifest edits.
Run with the bundled Windows Python, not the MSYS Python.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'preview/runtime/piper-1.8.0'
MODEL = RUNTIME / 'models/ru_RU-denis-medium.onnx'
MODEL_HASH = '879bc365cb14d1380e3f5ed6044162ccf54c99f6161871569b7f830aec3ce841'
PARAMETERS = dict(length_scale=1.08, noise_scale=0.5, noise_w_scale=0.333,
                  volume=0.88, paragraph_silence=0.45, mp3_bitrate_kbps=80)
MODEL_CARD = 'https://huggingface.co/rhasspy/piper-voices/blob/main/ru/ru_RU/denis/medium/MODEL_CARD'
MODEL_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx'


def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def workspace_path(value):
    path = (ROOT / value).resolve()
    if path != ROOT and ROOT not in path.parents:
        raise ValueError('Output must stay in the project folder')
    return path


def read_places():
    source = (ROOT / 'data/places.js').read_text(encoding='utf-8-sig')
    return json.JSONDecoder().raw_decode(source.split('const data = ', 1)[1])[0]


def atomic_write(path, content):
    temporary = path.with_name(path.name + '.denis.tmp')
    with temporary.open('wb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def save_manifest(path, manifest):
    atomic_write(path, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def main():
    parser = argparse.ArgumentParser(description='Бесплатная локальная предзапись Denis / Piper')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--ids', nargs='+')
    parser.add_argument('--max-places', type=int)
    parser.add_argument('--out-dir', default='audio')
    parser.add_argument('--manifest', default='preview/denis-manifest.json')
    args = parser.parse_args()
    places = [p for p in read_places() if p.get('story') and p.get('historyStatus') != 'pending']
    if args.ids:
        unknown = set(args.ids) - {p['id'] for p in places}
        if unknown:
            parser.error('Unknown or pending places: ' + ', '.join(sorted(unknown)))
        places = [p for p in places if p['id'] in set(args.ids)]
    if args.max_places is not None:
        if args.max_places < 1:
            parser.error('--max-places must be positive')
        places = places[:args.max_places]
    print(json.dumps(dict(event='selected', places=len(places), characters=sum(len(p['story']) for p in places)), ensure_ascii=False), flush=True)
    if args.dry_run:
        return 0
    output = workspace_path(args.out_dir)
    manifest_path = workspace_path(args.manifest)
    output.mkdir(exist_ok=True, parents=True)
    manifest_path.parent.mkdir(exist_ok=True, parents=True)
    if hashlib.sha256(MODEL.read_bytes()).hexdigest() != MODEL_HASH:
        raise ValueError('Denis model hash differs from the verified official HF LFS SHA256')
    sys.path.insert(0, str(RUNTIME / 'packages'))
    import lameenc
    import numpy as np
    from piper import PiperVoice, SynthesisConfig

    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig')) if manifest_path.exists() else {'files': {}}
    if manifest.get('voice') not in (None, 'denis'):
        raise ValueError('Refusing to replace another voice manifest')
    manifest.update(provider='Piper', voiceDisplayName='Денис', engine='Piper 1.8.0 / ONNX Runtime CPU',
                    voice='denis', quality='medium', parameters=PARAMETERS,
                    license=dict(model='MIT (piper-voices repository)', dataset='CC0', url=MODEL_CARD),
                    publicModelUrl=MODEL_URL, model_sha256=MODEL_HASH, sample_rate=22050)
    os.chdir(ROOT)
    # Relative ASCII path is required by the native Windows eSpeak bridge in this
    # Cyrillic workspace. No library patch or global environment change is needed.
    voice = PiperVoice.load(str(MODEL), use_cuda=False,
                           espeak_data_dir='preview/runtime/piper-1.8.0/packages/piper/espeak-ng-data')
    config = SynthesisConfig(length_scale=PARAMETERS['length_scale'], noise_scale=PARAMETERS['noise_scale'],
                             noise_w_scale=PARAMETERS['noise_w_scale'], volume=PARAMETERS['volume'])
    start = time.monotonic()
    generated = skipped = 0
    for number, place in enumerate(places, 1):
        id_ = place['id']
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', id_):
            raise ValueError('Unexpected place identifier')
        original = place['story']
        source_hash = sha(original)
        file = output / (id_ + '.mp3')
        previous = manifest['files'].get(id_, {})
        if previous.get('text_sha256') == source_hash and file.is_file() and file.stat().st_size > 1000:
            skipped += 1
        else:
            paragraphs = [p.strip() for p in original.replace('\r\n', '\n').split('\n\n') if p.strip()]
            synthesized_text = '\n\n'.join(paragraphs)
            rate = voice.config.sample_rate
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(PARAMETERS['mp3_bitrate_kbps'])
            encoder.set_in_sample_rate(rate)
            encoder.set_channels(1)
            encoder.set_quality(2)
            encoded = bytearray()
            samples = peak = 0
            for index, paragraph in enumerate(paragraphs):
                for chunk in voice.synthesize(paragraph, syn_config=config):
                    if chunk.sample_channels != 1 or chunk.sample_width != 2 or chunk.sample_rate != rate:
                        raise ValueError('Unexpected PCM format')
                    pcm = chunk.audio_int16_bytes
                    samples += len(pcm) // 2
                    peak = max(peak, int(np.abs(np.frombuffer(pcm, dtype=np.int16).astype(np.int32)).max()))
                    encoded.extend(encoder.encode(pcm))
                if index + 1 < len(paragraphs):
                    silence_samples = round(rate * PARAMETERS['paragraph_silence'])
                    encoded.extend(encoder.encode(bytes(silence_samples * 2)))
                    samples += silence_samples
            encoded.extend(encoder.flush())
            duration = samples / rate
            if len(encoded) < 1000 or duration < 1 or peak < 100:
                raise ValueError('Generated audio is empty or silent: ' + id_)
            atomic_write(file, encoded)
            manifest['files'][id_] = dict(src=file.relative_to(ROOT).as_posix(), voice='denis',
                                         text_sha256=source_hash, synthesizedText_sha256=sha(synthesized_text),
                                         duration_seconds=round(duration, 3), duration_basis='synthesized PCM including paragraph pauses',
                                         bytes=len(encoded), audio_sha256=hashlib.sha256(encoded).hexdigest(), peak_pcm16=peak,
                                         paragraphs=len(paragraphs))
            save_manifest(manifest_path, manifest)
            generated += 1
        if number % 10 == 0 or number == len(places):
            print(json.dumps(dict(event='progress', complete=number, total=len(places), generated=generated,
                                  skipped=skipped, elapsed_seconds=round(time.monotonic() - start, 1)), ensure_ascii=False), flush=True)
    save_manifest(manifest_path, manifest)
    print(json.dumps(dict(event='complete', generated=generated, skipped=skipped, files=len(manifest['files']),
                          bytes=sum(p['bytes'] for p in manifest['files'].values())), ensure_ascii=False), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
