"""Static local server. No GPS storage, account, or external API proxy."""
import argparse
import mimetypes
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
FILES = {'index.html','style.css','app.js','geo.js','sw.js','manifest.webmanifest','experience.js','experience.css'}
DIRECTORIES = {'assets','vendor','data','audio'}

def allowed_path(raw):
    path = unquote(urlsplit(raw).path).lstrip('/') or 'index.html'
    relative = Path(path)
    resolved = (ROOT / relative).resolve()
    if not resolved.is_relative_to(ROOT) or not resolved.is_file():
        return False
    if any(part.startswith('.') for part in relative.parts):
        return False
    return path in FILES or relative.parts[0] in DIRECTORIES

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not allowed_path(self.path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not allowed_path(self.path):
            self.send_error(404)
            return
        super().do_HEAD()

    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy','geolocation=(self), microphone=(), camera=()')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'")
        self.send_header('Cache-Control','no-cache')
        super().end_headers()

    def log_message(self,*_args):
        pass

def make_server(port=8765,lan=False):
    mimetypes.add_type('application/manifest+json','.webmanifest')
    mimetypes.add_type('text/javascript','.js')
    return ThreadingHTTPServer(('0.0.0.0' if lan else '127.0.0.1',port),partial(Handler,directory=str(ROOT)))

def main():
    parser=argparse.ArgumentParser(description='Рядом — локальный запуск')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--lan',action='store_true',help='Доступ из локальной сети; GPS телефона по HTTP недоступен')
    args=parser.parse_args()
    try:
        server=make_server(args.port,args.lan)
    except OSError:
        print('Порт занят. Попробуйте: python server.py --port 8766')
        return 1
    url=f'http://127.0.0.1:{server.server_port}'
    print('Рядом — мобильный MVP\n'+url+'\nОстановка: Ctrl+C',flush=True)
    if args.lan:
        print('Локальная сеть включена. Для GPS на телефоне нужен доверенный HTTPS-хостинг.',flush=True)
    if not args.no_browser:
        threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__=='__main__':
    raise SystemExit(main())
