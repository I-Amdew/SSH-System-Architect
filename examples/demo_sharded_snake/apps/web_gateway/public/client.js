const boardEl = document.getElementById("board");
const handoffsEl = document.getElementById("handoffs");
const ownerEl = document.getElementById("owner");
const tickEl = document.getElementById("tick");

let latestBoard = { width: 20, height: 10, boundaryX: 10 };
let latestState = {
  tick: 0,
  owner: "shard_a",
  snake: []
};

function renderBoard() {
  const rows = [];
  for (let y = 0; y < latestBoard.height; y += 1) {
    let row = "";
    for (let x = 0; x < latestBoard.width; x += 1) {
      const segmentIndex = latestState.snake.findIndex((segment) => segment.x === x && segment.y === y);
      if (segmentIndex === 0) {
        row += "O";
      } else if (segmentIndex > 0) {
        row += "o";
      } else if (x === latestBoard.boundaryX) {
        row += "|";
      } else {
        row += ".";
      }
    }
    rows.push(row);
  }
  boardEl.textContent = rows.join("\n");
  ownerEl.textContent = `owner: ${latestState.owner}`;
  tickEl.textContent = `tick: ${latestState.tick}`;
}

function renderHandoffs() {
  handoffsEl.replaceChildren();
  const handoffs = latestState.handoffs ?? [];
  if (handoffs.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No boundary handoff yet.";
    handoffsEl.appendChild(item);
    return;
  }
  for (const handoff of handoffs) {
    const item = document.createElement("li");
    item.textContent = `tick ${handoff.tick}: ${handoff.from} -> ${handoff.to} at x=${handoff.boundaryX}`;
    handoffsEl.appendChild(item);
  }
}

async function sendDirection(direction) {
  await fetch("/input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ direction })
  });
}

for (const button of document.querySelectorAll("button[data-direction]")) {
  button.addEventListener("click", () => sendDirection(button.dataset.direction));
}

window.addEventListener("keydown", (event) => {
  const mapping = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right"
  };
  const direction = mapping[event.key];
  if (direction) {
    sendDirection(direction);
  }
});

const stream = new EventSource("/events");
stream.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  if (payload.type === "snapshot") {
    latestBoard = payload.board;
    latestState = payload.state;
    renderBoard();
    renderHandoffs();
  }
};

renderBoard();
renderHandoffs();
