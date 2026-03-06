export type Direction = "up" | "down" | "left" | "right";

export interface Position {
  x: number;
  y: number;
}

export interface BoardConfig {
  width: number;
  height: number;
  boundaryX: number;
}

export interface ShardDescriptor {
  id: string;
  url: string;
  role: string;
  ownedColumns: [number, number];
}

export interface GatewayConfig {
  listenPort: number;
  tickMs: number;
  runtimeDir: string;
  board: BoardConfig;
  shards: ShardDescriptor[];
}

export interface ShardConfig {
  id: string;
  listenPort: number;
  hostTag: string;
  runtimeDir: string;
  ownedColumns: [number, number];
  handoffTarget: string;
}

export interface StepRequest {
  sessionId: string;
  tick: number;
  board: BoardConfig;
  head: Position;
  direction: Direction;
}

export interface HandoffEvent {
  tick: number;
  from: string;
  to: string;
  boundaryX: number;
  head: Position;
}

export interface StepResponse {
  decision: "accept" | "handoff";
  owner: string;
  nextHead: Position;
  notes: string[];
  handoff?: HandoffEvent;
}

export interface GameState {
  tick: number;
  length: number;
  direction: Direction;
  owner: string;
  snake: Position[];
  handoffs: HandoffEvent[];
}

export type GatewayEvent =
  | {
      type: "snapshot";
      state: GameState;
      board: BoardConfig;
    }
  | {
      type: "handoff";
      handoff: HandoffEvent;
    };

export function nextPosition(head: Position, direction: Direction, board: BoardConfig): Position {
  switch (direction) {
    case "up":
      return { x: head.x, y: (head.y - 1 + board.height) % board.height };
    case "down":
      return { x: head.x, y: (head.y + 1) % board.height };
    case "left":
      return { x: (head.x - 1 + board.width) % board.width, y: head.y };
    case "right":
      return { x: (head.x + 1) % board.width, y: head.y };
  }
}

export function createInitialState(board: BoardConfig, owner: string): GameState {
  return {
    tick: 0,
    length: 5,
    direction: "right",
    owner,
    snake: [
      { x: 2, y: Math.floor(board.height / 2) },
      { x: 1, y: Math.floor(board.height / 2) },
      { x: 0, y: Math.floor(board.height / 2) },
      { x: board.width - 1, y: Math.floor(board.height / 2) },
      { x: board.width - 2, y: Math.floor(board.height / 2) }
    ],
    handoffs: []
  };
}

export function isOppositeDirection(current: Direction, next: Direction): boolean {
  return (
    (current === "up" && next === "down") ||
    (current === "down" && next === "up") ||
    (current === "left" && next === "right") ||
    (current === "right" && next === "left")
  );
}

export function ownsColumn(ownedColumns: [number, number], x: number): boolean {
  return x >= ownedColumns[0] && x <= ownedColumns[1];
}
