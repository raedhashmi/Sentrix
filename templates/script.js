const promptUser = localStorage.getItem("account-username") || "User 1";
const windowTop = document.querySelector('.window-top');
const terminal = document.querySelector('.terminal');
const promptEl = document.querySelector('.prompt');
const input = document.querySelector('.command');
const isEmbedded = window !== window.parent;

let history = JSON.parse(localStorage.getItem("sentrix-history") || "[]");
let historyIndex = history.length;
let isMaximized = false;
let isMacSim = false;
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

document.addEventListener('keydown', function (event) {
  if (event.ctrlKey && event.key === "r") {
    event.preventDefault();
    location.reload();
  }
});

document.addEventListener('DOMContentLoaded', function () {
  promptEl.innerHTML = getPrompt();
  input.focus();

  if (isEmbedded) {
    windowTop.style.display = 'none';
    terminal.style.marginTop = '-42px';
  } else {
    windowTop.style.display = 'flex';
    terminal.style.marginTop = '22px';
  }

  if (!isEmbedded) {
    if (!localStorage.getItem("finder-fakeFS")) {
      fakeFS = {
        "/": [
          { name: "Documents", type: "folder" },
          { name: "Downloads", type: "folder" },
          { name: "Pictures", type: "folder" },
          { name: "Music", type: "folder" },
          { name: "Readme.txt", type: "file" }
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
  const shortPath = cwd === "/" ? "~" : cwd.replace(/^\//, '').replace(/\/$/, '');
  return `${promptUser.toLowerCase().replace(/\s+/g, '')}@sentrix ${shortPath} %`;
}

function appendTerminalOutput(output) {
  const prompt = getPrompt();

  if (output && output.trim() !== "") {
    terminal.innerHTML += `<pre class="terminal-output">${output}</pre>`;
  }

  terminal.innerHTML += `
    <div class="input-line">
      <span class="prompt">${prompt}</span>
      <div class="command" contenteditable="true" spellcheck="false"></div>
    </div>
  `;

  const newInput = terminal.querySelectorAll(".command");
  const currentInput = newInput[newInput.length - 1];
  currentInput.focus();
  attachInputListeners(currentInput);
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

      if (data.output === "__fs_request__") {
        handleFSCommand(command, cwd);
      } else if (data.output === "__clear__") {
        terminal.innerHTML = "";
      } else {
        appendTerminalOutput(data.output);
      }
    });
}

function handleFSCommand(command, cwd) {
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  let output = "";
  const fs = fakeFS;

  if (cmd === "?") {
    output = `Commands:\ncd, ls, mkdir, rm, rmdir, touch, cat, clear, echo, edit, mv, cp`;
  }

  else if (cmd === "ls") {
    const path = args[0] || cwd;
    output = (fs[path] || []).map(i => i.name).join("  ");
  }

  else if (cmd === "mkdir") {
    const name = args[0];
    const newPath = cwd === "/" ? `/${name}` : `${cwd}/${name}`;

    if (!name) {
      output = "mkdir: missing operand";
    } else if (fs[newPath]) {
      output = `mkdir: cannot create directory '${name}': File exists`;
    } else {
      if (!fs[cwd]) fs[cwd] = [];
      fs[cwd].push({ name, type: "folder" });
      fs[newPath] = [];
      output = "";
    }
  }

  else if (cmd === "rm" || cmd === "rmdir") {
    const name = args[0];
    const target = cwd === "/" ? `/${name}` : `${cwd}/${name}`;

    if (!name) {
      output = `${cmd}: missing operand`;
    } else {
      if (!fs[cwd]) fs[cwd] = [];
      fs[cwd] = fs[cwd].filter(f => f.name !== name);
      Object.keys(fs).forEach(k => {
        if (k === target || k.startsWith(target + "/")) delete fs[k];
      });
      output = "";
    }
  }

  else if (cmd === "touch") {
    const name = args[0];
    const newPath = cwd === "/" ? `/${name}` : `${cwd}/${name}`;

    if (!name) {
      output = "touch: missing file operand";
    } else {
      if (!fs[cwd]) fs[cwd] = [];
      const exists = fs[cwd].some(i => i.name === name);
      if (!exists) {
        fs[cwd].push({ name, type: "file" });
        fs[newPath] = { content: "" };
      }
      output = "";
    }
  }

  else if (cmd === "cat") {
    const name = args[0];
    const key = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    const exists = fs[cwd]?.some(i => i.name === name && i.type === "file");

    if (!name) {
      output = "cat: missing file operand";
    } else {
      output = exists ? (fs[key]?.content || "(empty file)") : `cat: ${name}: No such file`;
    }
  }

  else if (cmd === "edit") {
    const name = args[0];
    const key = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    const exists = fs[cwd]?.some(i => i.name === name && i.type === "file");

    if (!name) {
      output = "edit: missing file operand";
    } else if (!exists) {
      output = `edit: ${name}: No such file`;
    } else {
      const content = fs[key]?.content || "";
      const newContent = prompt(`Editing ${name}:`, content);
      if (newContent !== null) {
        fs[key].content = newContent;
      }
      output = "";
    }
  }

  else if (cmd === "cd") {
    const name = args[0];
    let newPath;

    if (!name || name === "/") {
      newPath = "/";
    } else {
      newPath = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
    }

    if (!fs[newPath]) {
      output = `cd: no such file or directory: ${name}`;
    } else {
      localStorage.setItem("sentrix-cwd", newPath);
      output = "";
    }
  }

  else if (cmd === "mv") {
    const [source, target] = args;
    const srcPath = cwd === "/" ? `/${source}` : `${cwd}/${source}`;
    const tgtPath = cwd === "/" ? `/${target}` : `${cwd}/${target}`;

    if (!source || !target) {
      output = "mv: missing file operand";
    } else if (!fs[srcPath] && !fs[cwd]?.some(i => i.name === source)) {
      output = `mv: cannot stat '${source}': No such file or directory`;
    } else {
      if (fs[srcPath]) {
        fs[tgtPath] = fs[srcPath];
        delete fs[srcPath];
      }
      if (fs[cwd]) {
        fs[cwd].forEach(i => {
          if (i.name === source) i.name = target;
        });
      }
      output = "";
    }
  }

  else if (cmd === "cp") {
    const [source, target] = args;
    const srcPath = cwd === "/" ? `/${source}` : `${cwd}/${source}`;
    const tgtPath = cwd === "/" ? `/${target}` : `${cwd}/${target}`;

    if (!source || !target) {
      output = "cp: missing file operand";
    } else if (!fs[srcPath] && !fs[cwd]?.some(i => i.name === source)) {
      output = `cp: cannot stat '${source}': No such file or directory`;
    } else {
      if (fs[srcPath]) {
        fs[tgtPath] = JSON.parse(JSON.stringify(fs[srcPath]));
      }
      if (fs[cwd]) {
        const item = fs[cwd].find(i => i.name === source);
        if (item) fs[cwd].push({ ...item, name: target });
      }
      output = "";
    }
  }

  if (isMacSim) {
    window.parent.postMessage({ type: "updateFS", fs }, "*");
  } else {
    localStorage.setItem("finder-fakeFS", JSON.stringify(fs));
  }

  appendTerminalOutput(output);
}

function attachInputListeners(inputEl) {
  inputEl.addEventListener("keydown", function (event) {
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

function expandWin() {
  fetch("/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maximize: !isMaximized })
  });

  isMaximized = !isMaximized;
}

function placeCaretAtEnd(el) {
  el.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(el);
  sel.collapseToEnd();
}