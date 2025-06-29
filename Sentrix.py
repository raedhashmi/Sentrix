from flask import Flask, jsonify, send_file, request
import subprocess
import webview
import screeninfo
import time
import os

app = Flask(__name__)

def is_mac_simulation(req):
    return req.headers.get("X-Embed-Source") == "mac-simulation"

@app.route("/")
def index():
    return send_file('templates/index.html')

@app.route("/resources/<path:filename>")
def resources(filename):
    return send_file(f'templates/{filename}')

@app.route("/close", methods=["GET"])
def close():
    window.destroy()
    return 'Success'

@app.route("/minimize", methods=["GET"])
def minimize():
    window.minimize()
    return 'Success'

@app.route("/expand", methods=["POST"])
def expand():
    data = request.get_json()
    maximize = data.get("maximize", True)

    if maximize:
        screen = screeninfo.get_monitors()[0]
        width = screen.width
        height = screen.height
        x = screen.x
        y = screen.y

        # Adjust to avoid taskbar (typically ~40px high on Windows)
        taskbar_offset = 40
        window.resize(width, height - taskbar_offset)
        window.move(x, y)
    else:
        # Restore to original size/position (adjust as needed)
        window.resize(1200, 600)
        window.move(100, 70)

    return jsonify({"status": "toggled"})

@app.route("/run", methods=["POST"])
def run():
    data = request.get_json()
    command = data.get("command", "").strip()
    cwd = data.get("cwd", "/")

    print("\u001b[35m[-] Received command:", command, "| cwd:", cwd, "\u001b[0m")

    parts = command.split()
    output = ""

    if not parts:
        return jsonify({"output": "", "cwd": cwd})

    cmd = parts[0]
    args = parts[1:]

    if cmd == "pwd":
        output = cwd

    elif cmd == "cd":
        if not args:
            cwd = "/"
        else:
            raw = args[0]
            new_path = os.path.normpath(os.path.join(cwd, raw)).replace("\\", "/")
            cwd = new_path
            output = ""

    elif cmd == "?" or cmd == "help":
        output = (
            "Supported Commands:\n"
            + "ls           - List files and directories\n"
            + "cd           - Change directory\n"
            + "pwd          - Show current directory\n"
            + "mkdir &lt;name&gt; - Make new folder\n"
            + "touch &lt;file&gt; - Create empty file\n"
            + "cat &lt;file&gt;   - Show file contents\n"
            + "echo &lt;msg&gt;   - Print message\n"
            + "edit &lt;file&gt; &lt;content&gt; - Overwrite file with content\n"
            + "mv &lt;old&gt; &lt;new&gt; - Rename files or folders\n"
            + "cp &lt;src&gt; &lt;dest&gt; - Copy file/folder\n"
            + "rm &lt;name&gt;    - Delete file or folder\n"
            + "color &lt;hex&gt;  - Change Sentrix theme color\n"
            + "download     - Download Sentrix app (Windows only)\n"
            + "clear        - Clear the terminal screen\n"
            + "mission      - View <span style='color: #e67f00'>mission</span> system commands\n"
            + "cd ..        - Go up one folder\n"
            + "? or help    - Show this help menu"
        )

    elif cmd == "ls" or cmd == "mkdir" or cmd == "rm" or cmd == "rmdir" or cmd == "touch" or cmd == "cat" or cmd == "mv" or cmd == "cp" or cmd == "edit" or cmd == 'clear' or cmd == 'download' or cmd == 'color' or cmd == 'mission':
        output = "__fs_request__"

    elif cmd == "echo":
        output = " ".join(args)

    else:
        try:
            result = subprocess.run(command, capture_output=True, text=True, shell=True)
            output = result.stdout or result.stderr
        except Exception as e:
            output = str(e)

    return jsonify({"output": output, "cwd": cwd})

@app.route("/move_win", methods=["POST"])
def move_win():
    data = request.get_json()
    dx = data.get("dx", 0)
    dy = data.get("dy", 0)
    window.move(window.x + dx, window.y + dy)
    return jsonify({"status": "success"})

@app.route("/download_exe", methods=["GET"])
def download_exe():
    exe_path = os.path.join("dist", "Sentrix.exe")
    if os.path.exists(exe_path):
        return send_file(exe_path, as_attachment=True)
    return "Sentrix.exe not found", 404

if __name__ == '__main__':
    print('\u001b[32m[/] Powering up Sentrix...')
    time.sleep(1)
    print('\u001b[34m[-] Sentrix backend initialized successfully.')
    print('\u001b[36m[~] Running at http://localhost:8000\u001b[0m')
    window = webview.create_window(
        'Sentrix',
        app,
        height=600,
        width=1200,
        frameless=True,
        resizable=True,
        easy_drag=True,
        http_port=8000
    )
    webview.start()