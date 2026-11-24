"""Host Mountain Bowling for browsers on a shared network. Python 3, no packages."""
import os
import ipaddress
import webbrowser
import sys
import json
import math
import mimetypes
import secrets
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
ROOMS = {}
LOCK = threading.Lock()


def require(ok, message):
    if not ok:
        raise ValueError(message)


def handle(action, data):
    now = time.monotonic()
    for code in list(ROOMS):
        if now - ROOMS[code]['seen'] > 21600:
            del ROOMS[code]
    if action in ('create', 'join'):
        name = str(data.get('name', '')).strip()
        require(0 < len(name) <= 22, 'Enter a name of up to 22 characters.')
        if action == 'create':
            code = secrets.token_hex(3).upper()
            while code in ROOMS:
                code = secrets.token_hex(3).upper()
            room = ROOMS[code] = dict(players=[], looks=[], tokens=[], events=[], votes={}, skips={}, started=False,
                                      match=0, seed=secrets.randbits(32), tier=0, seen=now)
        else:
            code = str(data.get('code', '')).upper()
            room = ROOMS.get(code)
            require(room and not room['started'], 'Room unavailable or already playing.')
        require(len(room['players']) < 5, 'Room is full.')
        base = name
        suffix = 2
        while name.casefold() in {n.casefold() for n in room['players']}:
            name = f'{base[:18]} {suffix}'
            suffix += 1
        token = secrets.token_urlsafe(24)
        room['players'].append(name)
        room['looks'].append(str(data.get('look',''))[:160])
        room['tokens'].append(token)
        return dict(code=code, token=token, seat=len(room['players'])-1)
    room = ROOMS.get(data.get('code'))
    require(room and data.get('token') in room['tokens'], 'Session expired. Return to the title screen.')
    seat = room['tokens'].index(data['token'])
    room['seen'] = now
    seq = len(room['events'])
    if action == 'leave':
        if room['started'] or seat == 0:
            del ROOMS[data['code']]
        else:
            room['players'].pop(seat)
            room['looks'].pop(seat)
            room['tokens'].pop(seat)
        return {}
    if action == 'start':
        require(seat == 0 and not room['started'] and len(room['players']) >= 2, 'Host needs at least two players.')
        require(data.get('tier') in (0, 1, 2, 3, 4, 5), 'Choose a difficulty.')
        if data['tier']==4:
            pack=data.get('pack')
            require(isinstance(pack,str) and len(pack)<=90000 and isinstance(body:=json.loads(pack),dict) and isinstance(body.get('levels'),list) and len(body['levels'])==3,'Choose a three-level pack.')
            room['pack']=pack
        room.update(started=True, tier=data['tier'])
    elif action == 'restart':
        require(seat == 0 and room['started'] and data.get('match') == room['match'], 'Host must restart the current match.')
        room.update(match=room['match']+1, seed=secrets.randbits(32), events=[], votes={}, skips={})
    elif action == 'skip':
        key=data.get('flyover','')
        require(room['started'] and data.get('match')==room['match'] and isinstance(key,str) and 0<len(key)<=48, 'Flyover changed.')
        room['skips'].setdefault(key,set()).add(seat)
    elif action == 'poll':
        if room['started'] and data.get('match', 0) == room['match'] and data.get('seq') == seq and type(data.get('ready')) is int and 0 <= data['ready'] < len(room['players']):
            room['votes'][seat] = data['ready']
    elif action == 'reroll':
        require(seat == 0 and room['started'] and room['tier'] == 3 and data.get('match') == room['match'] and data.get('seq') == seq, 'Host must reroll the active random course.')
        room['events'].append(dict(type='reroll',seed=secrets.randbits(32)))
        room['votes'].clear()
    elif action == 'roll':
        require(room['started'] and data.get('match', 0) == room['match'] and data.get('seq') == seq, 'Turn already changed.')
        require(room['votes'].get(0) == seat, 'Wait for the host to confirm your turn.')
        shot = {}
        for key, low, high in [('aim', -18, 18), ('power', 10, 100), ('curve', -12, 12), ('stance', -20, 20)]:
            val = data.get(key)
            require(type(val) in (int, float) and math.isfinite(val) and low <= val <= high, 'Invalid throw.')
            shot[key] = val
        room['events'].append(dict(**shot, seat=seat, seed=secrets.randbits(32)))
        room['votes'].clear()
    else:
        raise ValueError('Unknown request.')
    cursor = data.get('seq', 0)
    require(type(cursor) is int and cursor >= 0, 'Invalid turn.')
    votes = room['votes']
    turn = votes.get(0, -1)
    fly=data.get('flyover','')
    skip=room['skips'].get(fly,set())
    return dict(pack=room.get('pack') if data.get('needPack') or data.get('match')!=room['match'] else None,flyover=fly,skipVotes=len(skip),needed=len(room['players'])//2+1,voted=seat in skip,seat=seat, looks=room['looks'], players=room['players'][:], started=room['started'], tier=room['tier'], seed=room['seed'],
                turn=turn, seq=len(room['events']), match=room['match'], events=room['events'][cursor if data.get('match', 0)==room['match'] else 0:])


class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, mime):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            require(self.headers.get('Content-Type') == 'application/json', 'JSON required.')
            origin = self.headers.get('Origin')
            require(not origin or urlsplit(origin).netloc == self.headers.get('Host'), 'Wrong origin.')
            length = int(self.headers.get('Content-Length', '0'))
            require(0 < length <= (131072 if self.path=='/room/start' else 2048) and self.path.startswith('/room/'), 'Invalid request.')
            data = json.loads(self.rfile.read(length))
            require(isinstance(data, dict), 'Invalid request.')
            with LOCK:
                action = self.path[6:]
                result = handle(action, data)
            if action in ('create','join'):
                result['invite'] = '/?room=' + result['code']
            self.send(200, json.dumps(result).encode(), 'application/json')
        except (ValueError, TypeError, KeyError) as err:
            self.send(400, json.dumps(dict(error=str(err))).encode(), 'application/json')

    def do_GET(self):
        path = urlsplit(self.path).path.strip('/') or 'index.html'
        file = (ROOT / path).resolve()
        if ROOT not in file.parents or not file.is_file() or (file.parent != ROOT/'assets' and path not in {'index.html','game.js','creator-data.js','editor-view.js','creator.js','rooms.js','style.css','course-3d.js','textures.js','resort-models.js','course-map.js'}):
            self.send_error(404)
            return
        self.send(200, file.read_bytes(), mimetypes.guess_type(path)[0] or 'application/octet-stream')

    def log_message(self, fmt, *args):
        pass


def lan_address():
    try:
        addresses = socket.gethostbyname_ex(socket.gethostname())[2]
        return next(ip for ip in addresses if ipaddress.ip_address(ip).is_private and not ip.startswith('127.'))
    except (OSError, StopIteration):
        return socket.gethostname()


if __name__ == '__main__':
    port = int(os.environ.get('PORT','8080'))
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
