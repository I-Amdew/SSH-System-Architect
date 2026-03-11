# demo_bot_arena deployment model

- Shared Git-tracked code:
  `apps/spectator_dashboard`, `services/match_coordinator`, `services/snake_bot`, and `packages/shared_protocol`.
- Role-specific overlays:
  `deploy/overlays/coordinator`, `deploy/overlays/bot_a`, `deploy/overlays/bot_b`, `deploy/overlays/bot_c`, and `deploy/overlays/bot_d`.
- Runtime-only files:
  `runtime/coordinator` and `runtime/bot_*`.

The coordinator is the only middleman. Bots do not talk to each other directly. They only answer move requests from the coordinator.
