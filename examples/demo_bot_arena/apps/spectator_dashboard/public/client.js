const canvas = document.getElementById("arena");
const context = canvas.getContext("2d");
const metaEl = document.getElementById("meta");
const scoreboardEl = document.getElementById("scoreboard");
const eventsEl = document.getElementById("events");

let latestArena = { width: 24, height: 14 };
let latestState = { tick: 0, bots: [], orbs: [], events: [] };

function drawArena() {
  const cellSize = Math.floor(Math.min(canvas.width / latestArena.width, canvas.height / latestArena.height));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#071017";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const orb of latestState.orbs) {
    context.fillStyle = "#ffd166";
    context.beginPath();
    context.arc(orb.x * cellSize + cellSize / 2, orb.y * cellSize + cellSize / 2, cellSize * 0.15, 0, Math.PI * 2);
    context.fill();
  }

  for (const bot of latestState.bots) {
    bot.body.forEach((segment, index) => {
      context.fillStyle = index === 0 ? bot.color : `${bot.color}cc`;
      context.beginPath();
      context.arc(segment.x * cellSize + cellSize / 2, segment.y * cellSize + cellSize / 2, cellSize * (index === 0 ? 0.35 : 0.28), 0, Math.PI * 2);
      context.fill();
    });
  }
}

function renderSidebar() {
  metaEl.textContent = `tick: ${latestState.tick} | winner: ${latestState.winnerId ?? "in progress"}`;
  scoreboardEl.replaceChildren();
  [...latestState.bots]
    .sort((left, right) => right.score - left.score)
    .forEach((bot) => {
      const row = document.createElement("div");
      row.className = "score-row";
      row.innerHTML = `<span>${bot.name} (${bot.hostTag})</span><strong>${bot.score}</strong>`;
      scoreboardEl.appendChild(row);
    });
  eventsEl.replaceChildren();
  for (const event of latestState.events) {
    const item = document.createElement("li");
    item.textContent = event;
    eventsEl.appendChild(item);
  }
}

async function refresh() {
  const response = await fetch("/state");
  if (!response.ok) {
    return;
  }
  const payload = await response.json();
  latestArena = payload.arena;
  latestState = payload.state;
  drawArena();
  renderSidebar();
}

setInterval(() => {
  refresh().catch((error) => console.error(error));
}, 200);

refresh().catch((error) => console.error(error));
