# Classification reference

Classify every touched path before you describe or modify it.

- `shared_repo`:
  Git-tracked code that should be the same across hosts.
- `overlay`:
  Git-tracked files that intentionally differ by role or host.
- `runtime`:
  host-only state, logs, or service output that is not shared source.
- `drift`:
  host-local changes to tracked source or overlays that are not part of the intended deploy.

If a user says "patch the service on both hosts," verify whether they mean:

- shared source on all hosts,
- one overlay per role,
- runtime-only inspection,
- or drift cleanup on one host.
