export interface Position {
  x: number;
  y: number;
}

export interface Velocity {
  x: number;
  y: number;
}

export interface ArenaConfig {
  width: number;
  height: number;
  maxTicks: number;
  tickMs: number;
}

export interface BotDescriptor {
  id: string;
  name: string;
  color: string;
  endpoint: string;
  hostTag: string;
}

export interface CoordinatorConfig {
  listenPort: number;
  runtimeDir: string;
  arena: ArenaConfig;
  bots: BotDescriptor[];
}

export interface BotConfig {
  id: string;
  name: string;
  color: string;
  listenPort: number;
  runtimeDir: string;
  strategy: "greedy" | "ambush" | "sweeper" | "chaotic";
  seed: number;
}

export interface OrbState extends Position {
  id: string;
}

export interface BotSnake {
  id: string;
  name: string;
  color: string;
  hostTag: string;
  alive: boolean;
  score: number;
  body: Position[];
  velocity: Velocity;
}

export interface ArenaState {
  tick: number;
  winnerId?: string;
  bots: BotSnake[];
  orbs: OrbState[];
  events: string[];
}

export interface BotView {
  tick: number;
  arena: ArenaConfig;
  self: BotSnake;
  opponents: BotSnake[];
  orbs: OrbState[];
}

export interface BotDecision {
  velocity: Velocity;
  taunt?: string;
}

export interface TickResult {
  tick: number;
  state: ArenaState;
}

export function wrapPosition(position: Position, arena: ArenaConfig): Position {
  return {
    x: (position.x + arena.width) % arena.width,
    y: (position.y + arena.height) % arena.height
  };
}

export function addPosition(position: Position, velocity: Velocity, arena: ArenaConfig): Position {
  return wrapPosition(
    {
      x: position.x + velocity.x,
      y: position.y + velocity.y
    },
    arena
  );
}

export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function normalizeVelocity(velocity: Velocity): Velocity {
  if (Math.abs(velocity.x) >= Math.abs(velocity.y) && velocity.x !== 0) {
    return { x: Math.sign(velocity.x), y: 0 };
  }
  if (velocity.y !== 0) {
    return { x: 0, y: Math.sign(velocity.y) };
  }
  return { x: 1, y: 0 };
}

export function chooseVelocityToward(from: Position, to: Position): Velocity {
  return normalizeVelocity({
    x: to.x - from.x,
    y: to.y - from.y
  });
}

export function createInitialSnake(descriptor: BotDescriptor, arena: ArenaConfig, index: number): BotSnake {
  const anchors = [
    { x: 3, y: 3, velocity: { x: 1, y: 0 } },
    { x: arena.width - 4, y: 3, velocity: { x: -1, y: 0 } },
    { x: 3, y: arena.height - 4, velocity: { x: 1, y: 0 } },
    { x: arena.width - 4, y: arena.height - 4, velocity: { x: -1, y: 0 } }
  ];
  const anchor = anchors[index % anchors.length];
  return {
    id: descriptor.id,
    name: descriptor.name,
    color: descriptor.color,
    hostTag: descriptor.hostTag,
    alive: true,
    score: 0,
    velocity: anchor.velocity,
    body: [
      { x: anchor.x, y: anchor.y },
      { x: anchor.x - anchor.velocity.x, y: anchor.y - anchor.velocity.y },
      { x: anchor.x - anchor.velocity.x * 2, y: anchor.y - anchor.velocity.y * 2 }
    ].map((segment) => wrapPosition(segment, arena))
  };
}
