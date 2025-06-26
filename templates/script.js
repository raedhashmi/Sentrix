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
    terminal.innerHTML += `<pre class="terminal-output">${output}</pre>`;
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
}

function handleFSCommand(command, cwd) {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  let output = "";
  const fs = fakeFS;

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
    if (!name) {
      output = "mkdir: missing operand";
    } else if (fs[newPath]) {
      output = `mkdir: cannot create '${name}': exists`;
    } else {
      fs[cwd] = fs[cwd] || [];
      fs[cwd].push({ name, type: "folder" });
      fs[newPath] = [];
    }
  }

  else if (cmd === "rm" || cmd === "rmdir") {
    const name = args[0];
    const target = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    if (!name) {
      output = `${cmd}: missing operand`;
    } else {
      fs[cwd] = (fs[cwd] || []).filter(f => f.name !== name);
      Object.keys(fs).forEach(k => {
        if (k === target || k.startsWith(target + "/")) delete fs[k];
      });
    }
  }

  else if (cmd === "touch") {
    const name = args[0];
    const path = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    if (!name) {
      output = "touch: missing operand";
    } else {
      fs[cwd] = fs[cwd] || [];
      if (!fs[cwd].some(i => i.name === name)) {
        fs[cwd].push({ name, type: "file", content: "" });
        fs[path] = null;
      }
    }
  }

  else if (cmd === "echo") {
    output = args.join(" ");
  }

  else if (cmd === "cat") {
    const name = args[0];
    const file = (fs[cwd] || []).find(i => i.name === name && i.type === "file");
    output = file ? (file.content || "") : `cat: ${name}: No such file`;
  }

  else if (cmd === "edit") {
    const name = args[0];
    const content = args.slice(1).join(" ");
    const file = (fs[cwd] || []).find(i => i.name === name && i.type === "file");
    if (file) file.content = content;
    else output = `edit: ${name}: No such file`;
  }

  else if (cmd === "mv") {
    const [oldName, newName] = args;
    const file = (fs[cwd] || []).find(i => i.name === oldName);
    if (file) file.name = newName;
    else output = `mv: ${oldName}: No such file or directory`;
  }

  else if (cmd === "cp") {
    const [source, target] = args;
    const file = (fs[cwd] || []).find(i => i.name === source);
    if (file) {
      const copy = JSON.parse(JSON.stringify(file));
      copy.name = target;
      fs[cwd].push(copy);
    } else {
      output = `cp: ${source}: No such file or directory`;
    }
  }

  else if (cmd === "?" || cmd === "help") {
    output = "Supported commands:\nls, cd, mkdir, rm, touch, echo, cat, edit, mv, cp, ?";
  }

  else {
    output = `Command not found: ${cmd}`;
  }

  if (isMacSim) {
    window.parent.postMessage({ type: "updateFS", fs }, "*");
  } else {
    localStorage.setItem("finder-fakeFS", JSON.stringify(fs));
  }

  appendTerminalOutput(output);
}

function sendCommand(inputEl) {
  const command = inputEl.innerText.trim();
  const cwd = localStorage.getItem("sentrix-cwd") || "/";
  if (!command) return;

  history.push(command);
  historyIndex = history.length;
  localStorage.setItem("sentrix-history", JSON.stringify(history));

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
      else if (data.output === "__clear__") terminal.innerHTML = "";
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