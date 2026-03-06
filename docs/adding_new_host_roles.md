# Adding new host roles

1. Add a new overlay folder under `examples/demo_sharded_snake/deploy/overlays/` or the equivalent folder in your real app.
2. Put only role-specific config in that overlay:
   service units, role config JSON, env templates, reverse proxy fragments.
3. Add the new overlay path to the appropriate inventory host entries.
4. Update `role_labels`, `cluster_ids`, `managed_scopes`, `services`, and `health_checks`.
5. If the role produces host-local state, add a `runtime_paths` entry.
6. If the role lives on a hypervisor or root-capable host, review `root_allowed`, `privilege_mode`, and `vm_adapter_ids`.
7. Refresh indexes and confirm the new overlay is classified as `overlay`, not `shared_repo`.

Keep the shared service or app code in one shared root whenever possible. The demo uses one shared `snake_shard` codebase to make this distinction explicit.
