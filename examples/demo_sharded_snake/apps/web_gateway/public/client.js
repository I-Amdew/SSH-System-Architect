const canvas = document.getElementById("board");
const context = canvas.getContext("2d");
const handoffsEl = document.getElementById("handoffs");
const ownerEl = document.getElementById("owner");
const tickEl = document.getElementById("tick");
const scoreEl = document.getElementById("score");
const backendEl = document.getElementById("backend");

let latestBoard = { width: 24, height: 14, boundaryX: 12 };
let latestState = {
  tick: 0,
  score: 0,
  owner: "shard_b",
  snake: [],
  orbs: [],
  target: { x: 12, y: 7 },
  handoffs: []
};
let inputTimer = 0;

function boardToCanvas(position, cellSize) {
  return {
    x: position.x * cellSize + cellSize / 2,
    y: position.y * cellSize + cellSize / 2
  };
}

function renderBoard() {
  const cellSize = Math.floor(Math.min(canvas.width / latestBoard.width, canvas.height / latestBoard.height));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#102418";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255,255,255,0.06)";
  for (let x = 0; x < latestBoard.width; x += 1) {
    for (let y = 0; y < latestBoard.height; y += 1) {
      context.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
  }

  context.fillStyle = "rgba(255, 98, 76, 0.25)";
  context.fillRect(latestBoard.boundaryX * cellSize, 0, 2, latestBoard.height * cellSize);

  for (const orb of latestState.orbs) {
    const point = boardToCanvas(orb, cellSize);
    context.fillStyle = "#ffd166";
    context.beginPath();
    context.arc(point.x, point.y, cellSize * 0.18, 0, Math.PI * 2);
    context.fill();
  }

  latestState.snake.forEach((segment, index) => {
    const point = boardToCanvas(segment, cellSize);
    context.fillStyle = index === 0 ? "#7df9b4" : "#22b573";
    context.beginPath();
    context.arc(point.x, point.y, cellSize * (index === 0 ? 0.4 : 0.32), 0, Math.PI * 2);
    context.fill();
  });

  const targetPoint = boardToCanvas(latestState.target, cellSize);
  context.strokeStyle = "#f5f2dc";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(targetPoint.x - 8, targetPoint.y);
  context.lineTo(targetPoint.x + 8, targetPoint.y);
  context.moveTo(targetPoint.x, targetPoint.y - 8);
  context.lineTo(targetPoint.x, targetPoint.y + 8);
  context.stroke();

  ownerEl.textContent = `owner: ${latestState.owner}`;
  tickEl.textContent = `tick: ${latestState.tick}`;
  scoreEl.textContent = `score: ${latestState.score}`;
  backendEl.textContent = "backend: host_b";
}

function renderHandoffs() {
  handoffsEl.replaceChildren();
  const handoffs = latestState.handoffs ?? [];
  if (handoffs.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No cross-boundary turn yet.";
    handoffsEl.appendChild(item);
    return;
  }
  for (const handoff of handoffs) {
    const item = document.createElement("li");
    item.textContent = `tick ${handoff.tick}: ${handoff.from} -> ${handoff.to}`;
    handoffsEl.appendChild(item);
  }
}

async function sendTarget(target) {
  await fetch("/input", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target })
  });
}

function queueTargetFromPointer(event) {
  const bounds = canvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * latestBoard.width;
  const y = ((event.clientY - bounds.top) / bounds.height) * latestBoard.height;
  latestState.target = {
    x: Math.max(0, Math.min(latestBoard.width - 1, x)),
    y: Math.max(0, Math.min(latestBoard.height - 1, y))
  };
  renderBoard();
  if (inputTimer) {
    return;
  }
  inputTimer = window.setTimeout(() => {
    inputTimer = 0;
    sendTarget(latestState.target);
  }, 40);
}

canvas.addEventListener("mousemove", queueTargetFromPointer);
canvas.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (touch) {
    queueTargetFromPointer(touch);
  }
});

async function refresh() {
  const response = await fetch("/state");
  if (!response.ok) {
    return;
  }
  const payload = await response.json();
  latestBoard = payload.board;
  latestState = payload.state;
  renderBoard();
  renderHandoffs();
}

window.setInterval(() => {
  refresh().catch((error) => {
    console.error(error);
  });
}, 120);

refresh().catch((error) => {
  console.error(error);
});
