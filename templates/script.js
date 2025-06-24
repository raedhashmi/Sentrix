const promptUser = isMacSim ? (localStorage.getItem("account-username") || "User 1") : "guy1";
const input = document.querySelector(".command");
const isEmbedded = window !== window.parent;

input.focus()

function getPrompt() {
  return `${promptUser}@sentrix ~ %`;
}

function sendCommand(inputEl) {
  const command = inputEl.innerText.trim();
  if (!command) return;

  inputEl.innerText = command;
  inputEl.contentEditable = "false";

  fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      command: command, 
      cwd: localStorage.getItem("sentrix-cwd") || "/"
    })
  })
  .then(res => res.json())
  .then(data => {
    const prompt = getPrompt();
    terminal.innerHTML += `
      <pre>${data.output}</pre>
      <div class="input-line">
        <span class="prompt">${prompt}</span>
        <div class="command" contenteditable="true" spellcheck="false"></div>
      </div>
    `;

    const newInput = terminal.querySelectorAll(".command");
    const currentInput = newInput[newInput.length - 1];

    currentInput.focus();
    currentInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendCommand(currentInput);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const firstInput = document.querySelector(".command");
  if (firstInput) {
    firstInput.focus();
    firstInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendCommand(firstInput);
      }
    });
  }
});