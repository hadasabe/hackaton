"""Generate reusable Marina MP3 files. No network call without --approve-paid."""
import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def read_places():
    source=(ROOT/'data/places.js').read_text(encoding='utf-8-sig')
    return json.JSONDecoder().raw_decode(source.split('const data = ',1)[1])[0]

def main():
    parser=argparse.ArgumentParser(description='Предзапись спокойного аудиогида: Марина, neutral, 0.9×')
    parser.add_argument('--approve-paid',action='store_true',help='Явное подтверждение платных запросов SpeechKit')
    parser.add_argument('--dry-run',action='store_true',help='Показать объём, не обращаться к API')
    parser.add_argument('--ids',nargs='+',help='Идентификаторы выбранных мест; по умолчанию все')
    args=parser.parse_args()
    catalogue=read_places()
    if args.ids:
        if set(args.ids)-{p['id'] for p in catalogue}:
            parser.error('Есть неизвестные идентификаторы мест')
        catalogue=[p for p in catalogue if p['id'] in args.ids]
    print(f'Голос: marina / neutral / 0.9; записей: {len(catalogue)}; символов: {sum(len(p["story"]) for p in catalogue)}')
    if args.dry_run:
        print('Проверка завершена. Сетевых запросов и списаний нет.')
        return 0
    if not args.approve_paid:
        print('Генерация не запущена. Для платных запросов нужен явный параметр --approve-paid.')
        return 2
    api_key=os.environ.get('YANDEX_SPEECHKIT_API_KEY')
    if not api_key:
        print('Не задана переменная окружения YANDEX_SPEECHKIT_API_KEY. Не помещайте ключ в код или чат.')
        return 2
    manifest_path=ROOT/'data/audio-manifest.js'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8').split('window.RYADOM_AUDIO = ',1)[1].strip().removesuffix(';'))
    output=ROOT/'audio';output.mkdir(exist_ok=True)
    for p in catalogue:
        digest=hashlib.sha256(p['story'].encode('utf-8')).hexdigest()
        file=output/(p['id']+'.mp3')
        if manifest['files'].get(p['id'],{}).get('text_sha256')==digest and file.is_file():
            print('Уже готово: '+p['id'])
            continue
        data=urllib.parse.urlencode(dict(text=p['story'],lang='ru-RU',voice='marina',emotion='neutral',speed='0.9',format='mp3')).encode()
        request=urllib.request.Request('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize',data=data,headers={'Authorization':'Api-Key '+api_key,'Content-Type':'application/x-www-form-urlencoded'})
        try:
            with urllib.request.urlopen(request,timeout=90) as response:
                content=response.read(15*1024*1024+1)
        except urllib.error.HTTPError as exc:
            print(f'SpeechKit вернул HTTP {exc.code}; готовые файлы сохранены, повторных запросов нет.')
            return 1
        except (OSError,urllib.error.URLError):
            print('Не удалось подключиться к SpeechKit. Проверьте сеть и доверенные сертификаты; проверка TLS не отключается.')
            return 1
        if len(content)<256 or len(content)>15*1024*1024 or not (content.startswith(b'ID3') or (content[0]==255 and content[1]&224==224)):
            print('Ответ не похож на MP3. Файл и запись каталога не заменены.')
            return 1
        temp=file.with_suffix('.mp3.tmp');temp.write_bytes(content);temp.replace(file)
        manifest['files'][p['id']]=dict(src='audio/'+file.name,text_sha256=digest,voice='marina')
        temp_manifest=manifest_path.with_suffix('.js.tmp')
        temp_manifest.write_text('/* Generated offline recordings; no secrets. */\nwindow.RYADOM_AUDIO = '+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
        temp_manifest.replace(manifest_path)
        print('Готово: '+p['id'])
    return 0

if __name__=='__main__':sys.exit(main())
