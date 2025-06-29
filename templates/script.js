const promptUser = localStorage.getItem("account-username") || "User 1";
const windowTop = document.querySelector(".window-top");
const terminal = document.querySelector(".terminal");
const promptEl = document.querySelector(".prompt");
const input = document.querySelector(".command");
const isEmbedded = window !== window.parent;

let history = JSON.parse(localStorage.getItem("sentrix-history") || "[]");
let historyIndex = history.length;
let isMacSim = false;
let isMaximized = false;
let dragging = false;
let fakeFS = null;
let lastX = 0;
let lastY = 0;

window.addEventListener("message", (event) => {
  if (event.data === "mac_sim_ack") {
    isMacSim = true;
    window.parent.postMessage({ type: "getFS" }, "*");
    return;
  }
  if (event.data.type === "fsSnapshot") {
    try {
      fakeFS = JSON.parse(event.data.fs);
    } catch {
      fakeFS = {};
    }
  }
});

window.parent.postMessage("sentrix_handshake", "*");

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "r") {
    event.preventDefault();
    location.reload();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  promptEl.innerHTML = getPrompt();
  input.focus();

  if (localStorage.getItem('sentrix-terminal-history')) {
    terminal.innerHTML = localStorage.getItem('sentrix-terminal-history');
    const latestInput = terminal.querySelector(".input-line:last-child .command");
    if (latestInput) attachInputListeners(latestInput);
    latestInput.focus()

    const latestPrompt = terminal.querySelector(".input-line:last-child .prompt");
    if (latestPrompt) latestPrompt.innerHTML = getPrompt();
    const scrollHeight = document.body.scrollHeight + 10000
    window.scrollTo({
      top: scrollHeight,
      behavior: 'smooth' 
    });
  }


  if (isEmbedded) {
    windowTop.style.display = "none";
    terminal.style.marginTop = "-42px";
  } else {
    windowTop.style.display = "flex";
    terminal.style.marginTop = "22px";
  }

  if (!isEmbedded) {
    if (!localStorage.getItem("finder-fakeFS")) {
      fakeFS = {
        "/": [
          { name: "Documents", type: "folder" },
          { name: "Downloads", type: "folder" },
          { name: "Pictures", type: "folder" },
          { name: "Music", type: "folder" },
          { name: "Readme.txt", type: "file", content: "Welcome to Sentrix!" }
        ],
        "/Documents": [],
        "/Downloads": [],
        "/Pictures": [],
        "/Music": []
      };
      localStorage.setItem("finder-fakeFS", JSON.stringify(fakeFS));
    } else {
      fakeFS = JSON.parse(localStorage.getItem("finder-fakeFS"));
    }
  }

  const firstInput = document.querySelector(".command");
  if (firstInput) {
    firstInput.focus();
    attachInputListeners(firstInput);
  }
});

function getPrompt() {
  const cwd = localStorage.getItem("sentrix-cwd") || "/";
  const short = cwd === "/" ? "~" : cwd.replace(/^\//, "").replace(/\/$/, "");
  return `${promptUser.toLowerCase().replace(/\s+/g, "")}@sentrix ${short} %`;
}

function appendTerminalOutput(output) {
  if (output && output.trim() !== "") {
    terminal.innerHTML += `<pre>${output}</pre>`;
  }
  terminal.innerHTML += `
    <div class="input-line">
      <span class="prompt">${getPrompt()}</span>
      <div class="command" contenteditable="true" spellcheck="false"></div>
    </div>`;

  const newInput = terminal.querySelectorAll(".command");
  const currentInput = newInput[newInput.length - 1];
  currentInput.focus();
  attachInputListeners(currentInput);
  localStorage.setItem('sentrix-terminal-history', terminal.innerHTML)
}

function normalizePath(path) {
  const parts = path.split("/").filter(p => p && p !== ".");
  const stack = [];
  for (const part of parts) {
    if (part === "..") {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return "/" + stack.join("/");
}

function resolvePath(cwd, rawPath) {
  if (!rawPath) return cwd;
  if (rawPath.startsWith("/")) return rawPath;
  return normalizePath(cwd === "/" ? `/${rawPath}` : `${cwd}/${rawPath}`);
}

function getParentPath(path) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

function getFileFromPath(fs, fullPath) {
  const parent = getParentPath(fullPath);
  const fileName = fullPath.split("/").pop();
  const dir = fs[parent];
  return dir ? dir.find(f => f.name === fileName) : null;
}

function deleteFileFromPath(fs, fullPath) {
  const parent = getParentPath(fullPath);
  const fileName = fullPath.split("/").pop();
  if (fs[parent]) {
    fs[parent] = fs[parent].filter(f => f.name !== fileName);
  }
}

function applyObfAnimation() {
  const el = document.querySelector(".special-animation .obf");
  if (!el) return;

  const chars = "あいうえおかきくけこがぎぐげごさしすせそざじずぜぞたちつてとだぢづでどなにぬねのはひふへほばびぶべぼぱぴぷぺぽまみむめもやゆよらりるれろわをん/";
  const original = "__special__";

  clearInterval(window.__obfTimer);
  window.__obfTimer = setInterval(() => {
    let scrambled = "";
    for (let i = 0; i < original.length; i++) {
      scrambled += chars[Math.floor(Math.random() * chars.length)];
    }
    el.textContent = scrambled;
  }, 75);
}


function handleFSCommand(command, cwd) {
  const parts = command.trim().split(/\s+/);
  const args = parts.slice(1);
  const cmd = parts[0];
  const fs = fakeFS;
  let output = "";

  const saveFS = () => {
    if (isMacSim) {
      window.parent.postMessage({ type: "updateFS", fs }, "*");
    } else {
      localStorage.setItem("finder-fakeFS", JSON.stringify(fs));
    }
  };

  const saveMissionState = (state) => {
    localStorage.setItem("mission-state", JSON.stringify(state));
  };

  const getMissionState = () => {
    return JSON.parse(localStorage.getItem("mission-state") || "null");
  };

  const levelNames = [
    "Primitive", "Ramshackle", "Apprentice", "Journeyman",
    "Mastercraft", "Ascendant", "__special__"
  ];

  const allLevels = [
    [
      { desc: "Create a folder named 'web'", check: () => fs["/web"] !== undefined, xp: 10 },
      { desc: "Inside 'web', create 'index.html'", check: () => (fs["/web"] || []).some(f => f.name === "index.html"), xp: 15 },
      { desc: "Edit 'index.html' to contain basic HTML", check: () => {
        const file = (fs["/web"] || []).find(f => f.name === "index.html");
        return file && file.content.includes("<html>");
      }, xp: 20 },
      { desc: "Make a folder named 'scripts'", check: () => fs["/scripts"] !== undefined, xp: 10 },
      { desc: "Create a file 'main.js' in 'scripts'", check: () => (fs["/scripts"] || []).some(f => f.name === "main.js"), xp: 15 }
    ],
    [
      { desc: "Create a folder named 'notes'", check: () => fs["/notes"] !== undefined, xp: 10 },
      { desc: "Create 'todo.txt' inside 'notes'", check: () => (fs["/notes"] || []).some(f => f.name === "todo.txt"), xp: 15 },
      { desc: "Write something in 'todo.txt'", check: () => {
        const file = (fs["/notes"] || []).find(f => f.name === "todo.txt");
        return file && file.content.length > 0;
      }, xp: 15 },
      { desc: "Rename 'todo.txt' to 'tasks.txt'", check: () => (fs["/notes"] || []).some(f => f.name === "tasks.txt"), xp: 10 },
      { desc: "Copy 'tasks.txt' to root", check: () => (fs["/"] || []).some(f => f.name === "tasks.txt"), xp: 10 }
    ],
    [
      { desc: "Make a folder called 'projects'", check: () => fs["/projects"] !== undefined, xp: 10 },
      { desc: "Inside 'projects', create 'sentrix.txt'", check: () => (fs["/projects"] || []).some(f => f.name === "sentrix.txt"), xp: 15 },
      { desc: "Write 'Hello Sentrix' in 'sentrix.txt'", check: () => {
        const file = (fs["/projects"] || []).find(f => f.name === "sentrix.txt");
        return file && file.content.includes("Hello Sentrix");
      }, xp: 15 },
      { desc: "Rename 'sentrix.txt' to 'terminal.txt'", check: () => (fs["/projects"] || []).some(f => f.name === "terminal.txt"), xp: 10 },
      { desc: "Move 'terminal.txt' to root", check: () => (fs["/"] || []).some(f => f.name === "terminal.txt"), xp: 10 }
    ],
    [
      { desc: "Create folder 'data'", check: () => fs["/data"] !== undefined, xp: 10 },
      { desc: "Inside 'data', create 'log.txt'", check: () => (fs["/data"] || []).some(f => f.name === "log.txt"), xp: 10 },
      { desc: "Write 'log initialized' in 'log.txt'", check: () => {
        const file = (fs["/data"] || []).find(f => f.name === "log.txt");
        return file && file.content.includes("log initialized");
      }, xp: 15 },
      { desc: "Make a backup copy of 'log.txt' as 'log_backup.txt'", check: () => (fs["/data"] || []).some(f => f.name === "log_backup.txt"), xp: 15 },
      { desc: "Delete the folder 'notes'", check: () => fs["/notes"] === undefined, xp: 10 }
    ],
    [
      { desc: "Create 'config' folder", check: () => fs["/config"] !== undefined, xp: 10 },
      { desc: "Add 'settings.json' in 'config'", check: () => (fs["/config"] || []).some(f => f.name === "settings.json"), xp: 15 },
      { desc: "Edit 'settings.json' with '{debug: true}'", check: () => {
        const file = (fs["/config"] || []).find(f => f.name === "settings.json");
        return file && file.content.includes("debug");
      }, xp: 15 },
      { desc: "Delete 'tasks.txt' from root", check: () => !(fs["/"] || []).some(f => f.name === "tasks.txt"), xp: 10 },
      { desc: "Create 'final.txt' in root", check: () => (fs["/"] || []).some(f => f.name === "final.txt"), xp: 10 }
    ],
    [
      { desc: "Create 'archive' folder", check: () => fs["/archive"] !== undefined, xp: 10 },
      { desc: "Move 'main.js' from 'scripts' to 'archive'", check: () => (fs["/archive"] || []).some(f => f.name === "main.js"), xp: 15 },
      { desc: "Delete folder 'scripts'", check: () => fs["/scripts"] === undefined, xp: 10 },
      { desc: "Rename 'final.txt' to 'completed.txt'", check: () => (fs["/"] || []).some(f => f.name === "completed.txt"), xp: 10 },
      { desc: "Create 'README.md' and write Markdown in it", check: () => {
        const file = (fs["/"] || []).find(f => f.name === "README.md");
        return file && (file.content.includes("#") || file.content.includes("##"));
      }, xp: 15 }
    ],
    [
      { desc: "Create folder 'hidden'", check: () => fs["/hidden"] !== undefined, xp: 10 },
      { desc: "Inside 'hidden', create 'secrets.md'", check: () => (fs["/hidden"] || []).some(f => f.name === "secrets.md"), xp: 15 },
      { desc: "Write an encrypted-looking message in 'secrets.md'", check: () => {
        const file = (fs["/hidden"] || []).find(f => f.name === "secrets.md");
        return file && /[^\w\s]{5,}/.test(file.content || "");
      }, xp: 15 },
      { desc: "Create 'vault.lock'", check: () => (fs["/"] || []).some(f => f.name === "vault.lock"), xp: 10 },
      { desc: "Delete everything except 'vault.lock' and 'secrets.md'", check: () => {
        const allowed = new Set(["vault.lock", "hidden", "secrets.md"]);
        const isClean = Object.keys(fs).every(path => {
          if (path === "/hidden") {
            return (fs[path] || []).every(f => f.name === "secrets.md");
          }
          if (path === "/") {
            return (fs[path] || []).every(f => allowed.has(f.name));
          }
          return allowed.has(path.slice(1));
        });
        return isClean;
      }, xp: 20 }
    ]
  ];

  if (cmd === "mission") {
    const arg = args[0];
    let mission = getMissionState();

    if (!arg) {
      output = `<span style="color:#cccc">Usage:</span>
mission <span style="color:#33cc33">start</span> – Begin the mission
mission <span style="color:#ffaa00">resume</span> – Continue current mission
mission <span style="color:#ffcc00">current</span> – Show progress
mission <span style="color:#3399ff">level</span> – Show your level and XP
mission <span style="color:#ff4444">quit</span> – Abandon the mission`;
    } else if (arg === "start") {
      mission = { level: 0, index: 0, xp: 0, active: true };
      saveMissionState(mission);
      const first = allLevels[0][0];
      output = `<span style="color:#33cc33">Mission 1/5:</span> ${first.desc}`;
    } else if (arg === "level") {
      if (mission && mission.active) {
        const isSpecial = mission.level === 6;
        output = `<span style="color:#3399ff">Current Level:</span> ${
          isSpecial
            ? `<span class="special-animation"><span class="obf">__special__</span></span>`
            : levelNames[mission.level]
        } (XP: ${mission.xp})`;

      } else {
        output = `<span style="color:#ffaa00">No mission started yet.</span>`;
      }
    } else if (arg === "quit") {
      localStorage.removeItem("mission-state");
      appendTerminalOutput(`<span style="color:#ff4444">Mission abandoned.</span>`);
      return;
    } else if (arg === "resume" || arg === "current") {
      if (mission && mission.active) {
        const m = allLevels[mission.level]?.[mission.index];
        output = `<span style="color:#33cc33">Mission ${mission.index + 1}/5:</span> ${m?.desc || "All done!"}`;
      } else {
        output = `<span style="color:#ffaa00">No active mission to resume.</span>`;
      }
    } else {
      output = `<span style="color:#ff4444">Invalid mission argument</span>`;
    }

    appendTerminalOutput(output);
    return;
  }

  if (cmd === "ls") {
    const path = args[0] || cwd;
    output = (fs[path] || []).map(i => i.name).join("  ");
  }

  else if (cmd === "cd") {
    const name = args[0];
    const newPath = !name || name === "/" ? "/" : (cwd === "/" ? `/${name}` : `${cwd}/${name}`);
    if (fs[newPath]) {
      localStorage.setItem("sentrix-cwd", newPath);
    } else {
      output = `cd: no such directory: ${name}`;
    }
  }

  else if (cmd === "mkdir") {
    const name = args[0];
    const newPath = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    if (!name) output = "mkdir: missing operand";
    else if (fs[newPath]) output = `mkdir: cannot create '${name}': exists`;
    else {
      fs[cwd] = fs[cwd] || [];
      fs[cwd].push({ name, type: "folder" });
      fs[newPath] = [];
    }
  }

  else if (cmd === "rm" || cmd === "rmdir") {
    const name = args[0];
    const target = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    if (!name) output = `${cmd}: missing operand`;
    else {
      fs[cwd] = (fs[cwd] || []).filter(f => f.name !== name);
      Object.keys(fs).forEach(k => {
        if (k === target || k.startsWith(target + "/")) delete fs[k];
      });
    }
  }

  else if (cmd === "touch") {
    const name = args[0];
    const path = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    if (!name) output = "touch: missing operand";
    else {
      fs[cwd] = fs[cwd] || [];
      if (!fs[cwd].some(i => i.name === name)) {
        fs[cwd].push({ name, type: "file", content: "" });
        fs[path] = null;
      }
    }
  }

  else if (cmd === "edit") {
    const name = args[0];
    const content = args.slice(1).join(" ");
    const file = (fs[cwd] || []).find(i => i.name === name && i.type === "file");
    if (file) file.content = content;
    else output = `edit: ${name}: No such file`;
  }

  else if (cmd === "cat") {
    const name = args[0];
    const file = (fs[cwd] || []).find(i => i.name === name && i.type === "file");
    output = file ? (file.content || "") : `cat: ${name}: No such file`;
  }

  else if (cmd === "echo") {
    output = args.join(" ");
  }

  else if (cmd === "mv" || cmd === "cp") {
    const [src, dest] = args;
    const srcPath = resolvePath(cwd, src);
    const destPath = resolvePath(cwd, dest);
    const file = getFileFromPath(fs, srcPath);
    const parent = getParentPath(destPath);
    const newName = destPath.split("/").pop();

    if (!file || !fs[parent]) {
      output = `${cmd}: cannot ${cmd === "mv" ? "move" : "copy"}: invalid path`;
    } else {
      const newFile = { ...file, name: newName };
      fs[parent].push(newFile);
      if (cmd === "mv") deleteFileFromPath(fs, srcPath);
    }
  }

  else if (cmd === "clear") {
    terminal.innerHTML = "";
  }

  else if (cmd === "download") {
    const link = document.createElement("a");
    link.href = "/download_exe";
    link.download = "Sentrix.exe";
    link.click();
    output = "Thank you for downloading Sentrix.";
  }

  else {
    output = `Command not found: ${cmd}`;
  }

  let mission = getMissionState();
  if (mission && mission.active) {
    const step = allLevels[mission.level]?.[mission.index];
    if (step && step.check()) {
      mission.xp += step.xp;
      mission.index++;

      const lastLevel = allLevels.length - 1;
      const isLastLevel = mission.level >= lastLevel;
      const isLastTask = mission.index >= allLevels[mission.level].length;

      if (isLastLevel && isLastTask) {
        output += `\n<span class="special-level" style="color:#00ccff">🎉 Level up! You are now '<span class="obf">__special__</span>'</span>`;
        output += `\n<span style="color:#cccccc">All missions completed!</span>`;
        mission.active = false;
      } else if (isLastTask) {
        mission.level++;
        mission.index = 0;
        const newLevel = levelNames[mission.level];
        if (newLevel === "__special__") {
          output += `\n<span class="special-level" style="color:#00ccff">🎉 Level up! You are now '<span class="obf">__special__</span>'</span>`;
        } else {
          output += `\n<span style="color:#00ccff">🎉 Level up! You are now '${newLevel}'</span>`;
        }
        output += `\n<span style="color:#33cc33">Mission 1/5:</span> ${allLevels[mission.level][0].desc}`;
      } else {
        output += `\n<span style="color:#66ff66">✔ Mission Complete!</span>`;
        output += `\n<span style="color:#33cc33">Mission ${mission.index + 1}/5:</span> ${allLevels[mission.level][mission.index].desc}`;
      }

      saveMissionState(mission);
    }
  }

  saveFS();
  appendTerminalOutput(output);
}

setInterval(() => {
  if (document.querySelector(".special-animation .obf")) {
    applyObfAnimation();
  }
}, 200);

function sendCommand(inputEl) {
  const command = inputEl.innerText.trim();
  const cwd = localStorage.getItem("sentrix-cwd") || "/";

  if (!command) return;

  if (history[history.length - 1] !== command) {
    history.push(command);
    localStorage.setItem("sentrix-history", JSON.stringify(history));
    historyIndex = history.length;
  }

  inputEl.innerText = command;
  inputEl.contentEditable = "false";

  fetch("/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Embed-Source": isEmbedded ? "mac-simulation" : "standalone"
    },
    body: JSON.stringify({ command, cwd })
  })
    .then(res => res.json())
    .then(data => {
      localStorage.setItem("sentrix-cwd", data.cwd || cwd);
      if (data.output === "__fs_request__") handleFSCommand(command, cwd);
      else appendTerminalOutput(data.output);
    });
}

function expandWin() {
  fetch("/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maximize: !isMaximized })
  });

  isMaximized = !isMaximized;
}

windowTop.addEventListener("mousedown", (e) => {
  dragging = true;
  lastX = e.screenX;
  lastY = e.screenY;
  document.addEventListener("mousemove", dragWindow);
  document.addEventListener("mouseup", stopDragging);
});

function dragWindow(e) {
  if (!dragging) return;
  const dx = e.screenX - lastX;
  const dy = e.screenY - lastY;
  moveWin(dx, dy);
  lastX = e.screenX;
  lastY = e.screenY;
}

function stopDragging() {
  dragging = false;
  document.removeEventListener("mousemove", dragWindow);
  document.removeEventListener("mouseup", stopDragging);
}

function moveWin(dx, dy) {
  fetch("/move_win", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dx, dy })
  });
}

function attachInputListeners(inputEl) {
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendCommand(inputEl);
      return;
    }

    if (event.key === "ArrowUp") {
      if (historyIndex > 0) {
        historyIndex--;
        inputEl.innerText = history[historyIndex];
        placeCaretAtEnd(inputEl);
      }
      event.preventDefault();
    }

    if (event.key === "ArrowDown") {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        inputEl.innerText = history[historyIndex];
        placeCaretAtEnd(inputEl);
      } else {
        inputEl.innerText = "";
        historyIndex = history.length;
      }
      event.preventDefault();
    }
  });
}

function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(el);
  sel.collapseToEnd();
}