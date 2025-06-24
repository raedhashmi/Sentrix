from flask import Flask, jsonify, send_file, request
import subprocess
import webview
import json
import time
import os

app = Flask(__name__)
# Check if Sentrix is embedded inside Mac Simulation (simplified check)
def is_mac_simulation(req):
    # Add stricter checks in production
    return 'Referer' in req.headers and 'mac-simulation' in req.headers['Referer']

# Fake file system (used only if inside Mac Simulation)
FAKE_FS_PATH = 'fakefs.json'

def load_fake_fs():
    if os.path.exists(FAKE_FS_PATH):
        with open(FAKE_FS_PATH, 'r') as f:
            return json.load(f)
    return {
        "/": [
            {"name": "Documents", "type": "folder"},
            {"name": "Downloads", "type": "folder"},
            {"name": "Pictures", "type": "folder"},
            {"name": "Videos", "type": "folder"},
        ],
        "/Documents": [],
        "/Downloads": [],
        "/Pictures": [],
        "/Videos": []
    }

def save_fake_fs(fs):
    with open(FAKE_FS_PATH, 'w') as f:
        json.dump(fs, f)

@app.route('/')
def index():
    return send_file('templates/index.html')

@app.route('/resources/<path:filename>')
def resources(filename):
    return send_file(f'templates/{filename}')

@app.route('/close', methods=['GET'])
def close():
    window.destroy()

    return 'Success'

@app.route('/minimize', methods=['GET'])
def minimize():
    window.minimize()

    return 'Success'

@app.route('/expand', methods=['GET'])
def expand():
    if window.maximized == False:
        window.maximize()
    elif window.maximized == True:
        window.maximize()

    return 'Success'

@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    command = data.get("command", "").strip()
    cwd = data.get("cwd", "/")  # default to root if not sent
    is_macsim = is_mac_simulation(request)

    if is_macsim:
        fs = load_fake_fs()
        parts = command.split()
        output = ""

        if not parts:
            return jsonify({"output": "", "cwd": cwd})

        cmd = parts[0]
        args = parts[1:]

        if cmd == "ls":
            path = args[0] if args else cwd
            items = fs.get(path, [])
            output = "  ".join(i['name'] for i in items)

        elif cmd == "mkdir":
            if not args:
                output = "mkdir: missing operand"
            else:
                name = args[0]
                new_path = cwd + "/" + name if cwd != "/" else f"/{name}"
                if new_path in fs:
                    output = f"mkdir: cannot create directory '{name}': File exists"
                else:
                    fs[cwd].append({"name": name, "type": "folder"})
                    fs[new_path] = []
                    output = ""

        elif cmd in ["rm", "rmdir"]:
            if not args:
                output = f"{cmd}: missing operand"
            else:
                name = args[0]
                target = cwd + "/" + name if cwd != "/" else f"/{name}"
                exists = any(f['name'] == name for f in fs.get(cwd, []))
                if not exists:
                    output = f"{cmd}: cannot remove '{name}': No such file or directory"
                else:
                    fs[cwd] = [f for f in fs[cwd] if f['name'] != name]
                    keys_to_remove = [k for k in fs if k == target or k.startswith(target + "/")]
                    for k in keys_to_remove:
                        del fs[k]
                    output = ""

        elif cmd == "pwd":
            output = cwd

        elif cmd == "cd":
            if not args:
                cwd = "/"
            else:
                raw = args[0]
                new_path = os.path.normpath(os.path.join(cwd, raw)).replace("\\", "/")
                if new_path not in fs:
                    output = f"cd: no such file or directory: {raw}"
                else:
                    cwd = new_path
                    output = ""

        else:
            output = f"command not found: {cmd}"

        save_fake_fs(fs)
        return jsonify({"output": output, "cwd": cwd})

    else:
        try:
            result = subprocess.run(command, capture_output=True, text=True, shell=True)
            output = result.stdout or result.stderr
        except Exception as e:
            output = str(e)

        return jsonify({"output": output})

if __name__ == '__main__':
    print('\u001b[32m[✓] Powering up Sentrix...')
    time.sleep(1)
    print('\u001b[34m[•] Sentrix backend initialized successfully.')
    print('\u001b[36m[→] Running at http://localhost:3000\u001b[0m')
    window = webview.create_window(
        'Sentrix',
        app,
        height=600,
        width=1200,
        frameless=True,
        resizable=True,
        easy_drag=True,
        http_port=3000
    )
    webview.start()