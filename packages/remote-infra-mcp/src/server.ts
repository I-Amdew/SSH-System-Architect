import type { RemoteInfraOrchestrator } from "../../remote-infra-core/src/index.ts";
import { TOOL_DEFINITIONS } from "./tool-definitions.ts";

interface JsonRpcRequest {
  id?: string | number;
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  id: string | number | null;
  jsonrpc: "2.0";
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

function encodeMessage(message: object): string {
  const payload = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;
}

export class RemoteInfraMcpServer {
  private buffer = Buffer.alloc(0);
  private readonly orchestrator: RemoteInfraOrchestrator;

  constructor(orchestrator: RemoteInfraOrchestrator) {
    this.orchestrator = orchestrator;
  }

  start(): void {
    process.stdin.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer().catch((error: unknown) => {
        this.sendError(null, error instanceof Error ? error.message : String(error));
      });
    });
    process.stdin.resume();
  }

  private async processBuffer(): Promise<void> {
    while (true) {
      const separatorIndex = this.buffer.indexOf("\r\n\r\n");
      if (separatorIndex === -1) {
        return;
      }
      const headerText = this.buffer.slice(0, separatorIndex).toString("utf8");
      const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/iu);
      if (!contentLengthMatch) {
        throw new Error("Missing Content-Length header");
      }
      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = separatorIndex + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }
      const body = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      const message = JSON.parse(body) as JsonRpcRequest;
      await this.handleMessage(message);
    }
  }

  private send(message: JsonRpcResponse): void {
    process.stdout.write(encodeMessage(message));
  }

  private sendError(id: JsonRpcResponse["id"], message: string): void {
    this.send({
      id,
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message
      }
    });
  }

  private formatToolResult(result: unknown) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      structuredContent: result
    };
  }

  private async handleMessage(message: JsonRpcRequest): Promise<void> {
    if (!("method" in message)) {
      return;
    }

    try {
      switch (message.method) {
        case "initialize":
          this.send({
            id: message.id ?? null,
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2025-06-18",
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: "remote-infra-mcp",
                version: "0.1.0"
              }
            }
          });
          return;
        case "notifications/initialized":
          return;
        case "tools/list":
          this.send({
            id: message.id ?? null,
            jsonrpc: "2.0",
            result: {
              tools: TOOL_DEFINITIONS
            }
          });
          return;
        case "tools/call": {
          const params = message.params ?? {};
          const toolName = String(params.name ?? "");
          const args = (params.arguments ?? {}) as Record<string, unknown>;
          const result = await this.invokeTool(toolName, args);
          this.send({
            id: message.id ?? null,
            jsonrpc: "2.0",
            result: this.formatToolResult(result)
          });
          return;
        }
        default:
          this.sendError(message.id ?? null, `Unsupported method: ${message.method}`);
      }
    } catch (error) {
      this.sendError(message.id ?? null, error instanceof Error ? error.message : String(error));
    }
  }

  private async invokeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case "describe_control_plane":
        return this.orchestrator.describeControlPlane();
      case "list_hosts":
        return this.orchestrator.listHosts();
      case "read_inventory":
        return this.orchestrator.readInventory();
      case "list_clusters":
        return this.orchestrator.listClusters();
      case "explain_cluster":
        return this.orchestrator.explainCluster(String(args.clusterId));
      case "list_vm_adapters":
        return this.orchestrator.listVmAdapters();
      case "explain_host_role":
        return this.orchestrator.explainHostRole(String(args.hostId));
      case "read_remote_file":
        return this.orchestrator.readRemoteFile(String(args.hostId), String(args.path));
      case "write_remote_file":
        return this.orchestrator.writeRemoteFile(String(args.hostId), String(args.path), String(args.contents));
      case "apply_remote_patch":
        return this.orchestrator.applyRemotePatch(
          String(args.hostId),
          String(args.path),
          (args.operations ?? []) as never[]
        );
      case "run_remote_command":
        return this.orchestrator.runRemoteCommand(String(args.hostId), {
          argv: (args.argv ?? []) as string[],
          cwd: args.cwd ? String(args.cwd) : undefined,
          requiresPrivilege: Boolean(args.requiresPrivilege),
          reason: args.reason ? String(args.reason) : undefined
        });
      case "git_status":
        return this.orchestrator.gitStatus(String(args.hostId));
      case "git_fetch":
        return this.orchestrator.gitFetch(String(args.hostId), args.remote ? String(args.remote) : undefined);
      case "git_pull":
        return this.orchestrator.gitPull(
          String(args.hostId),
          args.remote ? String(args.remote) : undefined,
          args.branch ? String(args.branch) : undefined
        );
      case "git_push":
        return this.orchestrator.gitPush(
          String(args.hostId),
          args.remote ? String(args.remote) : undefined,
          args.branch ? String(args.branch) : undefined
        );
      case "git_clone":
        return this.orchestrator.gitClone(
          String(args.hostId),
          String(args.repositoryUrl),
          args.targetPath ? String(args.targetPath) : undefined
        );
      case "report_repo_state":
        return this.orchestrator.reportRepoState(
          (args.hostIds as string[]) ?? undefined,
          args.clusterId ? String(args.clusterId) : undefined
        );
      case "service_status":
        return this.orchestrator.serviceStatus(
          String(args.hostId),
          args.serviceName ? String(args.serviceName) : undefined
        );
      case "restart_service":
        return this.orchestrator.restartService(
          String(args.hostId),
          String(args.serviceName),
          args.reason ? String(args.reason) : undefined
        );
      case "restart_service_group":
        return this.orchestrator.restartServiceGroup(
          String(args.serviceName),
          args.clusterId ? String(args.clusterId) : undefined,
          (args.hostIds as string[]) ?? undefined,
          args.reason ? String(args.reason) : undefined
        );
      case "tail_service_logs":
        return this.orchestrator.tailServiceLogs(
          String(args.hostId),
          String(args.serviceName),
          typeof args.lines === "number" ? args.lines : 100
        );
      case "refresh_indexes":
        return this.orchestrator.refreshIndexes(
          args.outputRoot ? String(args.outputRoot) : undefined,
          Boolean(args.exhaustiveFiles),
          (args.hostIds as string[]) ?? undefined,
          args.clusterId ? String(args.clusterId) : undefined
        );
      case "diagnose_host_connectivity":
        return this.orchestrator.diagnoseHostConnectivity(String(args.hostId));
      case "report_network_health":
        return this.orchestrator.reportNetworkHealth(
          args.clusterId ? String(args.clusterId) : undefined,
          (args.hostIds as string[]) ?? undefined
        );
      case "discover_host_repos":
        return this.orchestrator.discoverHostRepos(String(args.hostId));
      case "bootstrap_host":
        return this.orchestrator.bootstrapHost(String(args.hostId), {
          repositoryUrl: args.repositoryUrl ? String(args.repositoryUrl) : undefined,
          branch: args.branch ? String(args.branch) : undefined,
          createRuntimeDirs: args.createRuntimeDirs === undefined ? undefined : Boolean(args.createRuntimeDirs),
          createOverlayDirs: args.createOverlayDirs === undefined ? undefined : Boolean(args.createOverlayDirs),
          reason: args.reason ? String(args.reason) : undefined
        });
      case "git_pull_group":
        return this.orchestrator.gitPullGroup(
          args.clusterId ? String(args.clusterId) : undefined,
          (args.hostIds as string[]) ?? undefined,
          args.remote ? String(args.remote) : undefined,
          args.branch ? String(args.branch) : undefined
        );
      case "compare_host_state":
        return this.orchestrator.compareState(String(args.hostId));
      case "generate_topology_summary":
        return this.orchestrator.generateTopologySummary();
      case "generate_host_summary":
        return this.orchestrator.generateHostSummary(String(args.hostId));
      case "vm_create":
      case "vm_delete":
      case "wipe_host":
      case "destroy_data":
      case "rotate_deploy_key":
      case "reimage_host":
        this.orchestrator.ensureDestructiveToolAllowed(toolName, args.confirmation ? String(args.confirmation) : undefined);
        return { acknowledged: true, tool: toolName };
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
