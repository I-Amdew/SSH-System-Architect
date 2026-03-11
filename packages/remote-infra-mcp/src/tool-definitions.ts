export const TOOL_DEFINITIONS = [
  {
    name: "describe_control_plane",
    description: "Describe the MCP control plane, its safety model, and the current inventory scope.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_hosts",
    description: "List SSH hosts from inventory with role labels and safety metadata.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "read_inventory",
    description: "Read the parsed inventory and role metadata used by the control plane.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_clusters",
    description: "List server clusters or groups defined in the inventory.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "explain_cluster",
    description: "Explain a cluster, the hosts in it, and the intended group behavior.",
    inputSchema: {
      type: "object",
      required: ["clusterId"],
      properties: {
        clusterId: { type: "string" }
      }
    }
  },
  {
    name: "list_vm_adapters",
    description: "List configured VM adapter slots and their capabilities.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "import_ssh_config_hosts",
    description: "Import host aliases from an existing OpenSSH config file and emit inventory-ready stubs.",
    inputSchema: {
      type: "object",
      properties: {
        configPath: { type: "string" },
        aliases: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "explain_host_role",
    description: "Explain a host role, deployment intent, overlays, runtime paths, and services.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "read_remote_file",
    description: "Read a remote file over SSH.",
    inputSchema: {
      type: "object",
      required: ["hostId", "path"],
      properties: {
        hostId: { type: "string" },
        path: { type: "string" }
      }
    }
  },
  {
    name: "write_remote_file",
    description: "Write a remote file over SSH without invoking destructive shell patterns.",
    inputSchema: {
      type: "object",
      required: ["hostId", "path", "contents"],
      properties: {
        hostId: { type: "string" },
        path: { type: "string" },
        contents: { type: "string" }
      }
    }
  },
  {
    name: "apply_remote_patch",
    description: "Apply structured text operations to a remote file.",
    inputSchema: {
      type: "object",
      required: ["hostId", "path", "operations"],
      properties: {
        hostId: { type: "string" },
        path: { type: "string" },
        operations: {
          type: "array",
          items: { type: "object" }
        }
      }
    }
  },
  {
    name: "run_remote_command",
    description: "Run a constrained remote command when a dedicated MCP tool is not available.",
    inputSchema: {
      type: "object",
      required: ["hostId", "argv"],
      properties: {
        hostId: { type: "string" },
        argv: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        requiresPrivilege: { type: "boolean" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "git_status",
    description: "Run git status on a remote host repo.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "git_fetch",
    description: "Run git fetch on a remote host repo.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" },
        remote: { type: "string" }
      }
    }
  },
  {
    name: "git_pull",
    description: "Run git pull on a remote host repo.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" },
        remote: { type: "string" },
        branch: { type: "string" }
      }
    }
  },
  {
    name: "git_push",
    description: "Run git push on a remote host repo.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" },
        remote: { type: "string" },
        branch: { type: "string" }
      }
    }
  },
  {
    name: "git_clone",
    description: "Clone the shared repo onto a remote host.",
    inputSchema: {
      type: "object",
      required: ["hostId", "repositoryUrl"],
      properties: {
        hostId: { type: "string" },
        repositoryUrl: { type: "string" },
        targetPath: { type: "string" }
      }
    }
  },
  {
    name: "report_repo_state",
    description: "Report deployed commit and working tree state per host.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "service_status",
    description: "Read service status on one host.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" },
        serviceName: { type: "string" }
      }
    }
  },
  {
    name: "restart_service",
    description: "Restart a configured service on one host.",
    inputSchema: {
      type: "object",
      required: ["hostId", "serviceName"],
      properties: {
        hostId: { type: "string" },
        serviceName: { type: "string" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "restart_service_group",
    description: "Restart one named service across a cluster or explicit host group.",
    inputSchema: {
      type: "object",
      required: ["serviceName"],
      properties: {
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        },
        serviceName: { type: "string" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "tail_service_logs",
    description: "Tail service logs on one host.",
    inputSchema: {
      type: "object",
      required: ["hostId", "serviceName"],
      properties: {
        hostId: { type: "string" },
        serviceName: { type: "string" },
        lines: { type: "number" }
      }
    }
  },
  {
    name: "refresh_indexes",
    description: "Refresh .infra-index using current host snapshots.",
    inputSchema: {
      type: "object",
      properties: {
        outputRoot: { type: "string" },
        exhaustiveFiles: { type: "boolean" },
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "inspect_system",
    description: "Inspect the whole managed system in one call: topology, host roles, health, repo state, repo discovery, drift classification, and optional index refresh.",
    inputSchema: {
      type: "object",
      properties: {
        outputRoot: { type: "string" },
        exhaustiveFiles: { type: "boolean" },
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        },
        refreshIndexes: { type: "boolean" },
        includeRepoDiscovery: { type: "boolean" }
      }
    }
  },
  {
    name: "diagnose_host_connectivity",
    description: "Probe OpenSSH reachability, repo presence, and health checks for one host.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "report_network_health",
    description: "Run connectivity and health diagnostics across a cluster or the whole inventory.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "discover_host_repos",
    description: "Discover existing Git repos on one host so they can be indexed or migrated into inventory.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "bootstrap_host",
    description: "Prepare a mutable host for management by ensuring the repo path and runtime directories exist, and clone the repo if missing.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" },
        repositoryUrl: { type: "string" },
        branch: { type: "string" },
        createRuntimeDirs: { type: "boolean" },
        createOverlayDirs: { type: "boolean" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "git_pull_group",
    description: "Pull the shared repo across a cluster or explicit host group.",
    inputSchema: {
      type: "object",
      properties: {
        clusterId: { type: "string" },
        hostIds: {
          type: "array",
          items: { type: "string" }
        },
        remote: { type: "string" },
        branch: { type: "string" }
      }
    }
  },
  {
    name: "compare_host_state",
    description: "Compare shared repo, overlay, runtime, and drift for one host.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "generate_topology_summary",
    description: "Generate a topology summary from inventory.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "generate_host_summary",
    description: "Generate a host summary including role, repo state, and classified files.",
    inputSchema: {
      type: "object",
      required: ["hostId"],
      properties: {
        hostId: { type: "string" }
      }
    }
  },
  {
    name: "vm_create",
    description: "High-risk VM provisioning tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  },
  {
    name: "vm_delete",
    description: "High-risk VM deletion tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  },
  {
    name: "wipe_host",
    description: "High-risk host wipe tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  },
  {
    name: "destroy_data",
    description: "High-risk data destruction tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  },
  {
    name: "rotate_deploy_key",
    description: "High-risk deploy key rotation tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  },
  {
    name: "reimage_host",
    description: "High-risk host reimage tool. Disabled by default and confirmation-gated.",
    inputSchema: {
      type: "object",
      required: ["confirmation"],
      properties: {
        confirmation: { type: "string" }
      }
    }
  }
] as const;
