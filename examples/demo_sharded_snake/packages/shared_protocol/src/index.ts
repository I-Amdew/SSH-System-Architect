export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
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
  target: Position;
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
  score: number;
  owner: string;
  snake: Position[];
  orbs: Position[];
  target: Position;
  velocity: Velocity;
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

export function wrapPosition(position: Position, board: BoardConfig): Position {
  return {
    x: (position.x + board.width) % board.width,
    y: (position.y + board.height) % board.height
  };
}

export function createInitialState(board: BoardConfig, owner: string): GameState {
  return {
    tick: 0,
    score: 0,
    owner,
    snake: [
      { x: 5, y: Math.floor(board.height / 2) },
      { x: 4, y: Math.floor(board.height / 2) },
      { x: 3, y: Math.floor(board.height / 2) },
      { x: 2, y: Math.floor(board.height / 2) },
      { x: 1, y: Math.floor(board.height / 2) }
    ],
    orbs: [],
    target: { x: board.width - 4, y: Math.floor(board.height / 2) },
    velocity: { x: 1, y: 0 },
    handoffs: []
  };
}

export function positionsEqual(left: Position, right: Position): boolean {
  return left.x === right.x && left.y === right.y;
}

export function ownsColumn(ownedColumns: [number, number], x: number): boolean {
  return x >= ownedColumns[0] && x <= ownedColumns[1];
}

export function directionToward(head: Position, target: Position): Velocity {
  const deltaX = target.x - head.x;
  const deltaY = target.y - head.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY) && deltaX !== 0) {
    return { x: Math.sign(deltaX), y: 0 };
  }
  if (deltaY !== 0) {
    return { x: 0, y: Math.sign(deltaY) };
  }
  return { x: 1, y: 0 };
}

export function nextPosition(head: Position, velocity: Velocity, board: BoardConfig): Position {
  return wrapPosition(
    {
      x: head.x + velocity.x,
      y: head.y + velocity.y
    },
    board
  );
}
