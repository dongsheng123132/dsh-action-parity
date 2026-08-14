# DSH Action Parity

Evidence that a business action is implemented once and reached consistently from CLI, MCP and GUI surfaces in [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness).

This plugin does not execute business actions and does not test buttons by pixels. It verifies a manifest of stable Action IDs, content-addressed action-core and binding declarations, and structural replay observations produced by each interface.

## What it verifies

- every CLI, MCP and GUI binding names the same stable `actionId` and `coreActionId`;
- GUI bindings expose `data-action-id:<actionId>` while CLI and MCP use stable machine identifiers;
- core modules, binding declarations and replay fixtures still match their declared SHA-256;
- the same fixture yields the same result digest, success state and state-version transition on every surface;
- stale mutations fail closed with `STALE_STATE` and do not advance state;
- confirmation-required actions enforce confirmation on every surface;
- missing/stale evidence and every parity failure are disclosed in a deterministic content-addressed report.

Inputs containing secret-, prompt-, chat-, raw input/output-, argv-, stdout- or stderr-shaped fields are rejected. Paths must remain inside `workspaceRoot`; symlink inputs and output directories are rejected. Only the explicit `artifactDir` is written, with atomic publication and SHA-256 read-back verification.

## Install

```sh
dsh plugin --profile web add github:dongsheng123132/dsh-action-parity
```

The bundle registers `dsh_action_parity_inspect` and `dsh_action_parity_verify`.

## CLI

```sh
dsh-action-parity inspect --workspace-root examples/basic --manifest action-parity.manifest.json
dsh-action-parity verify --workspace-root examples/basic --manifest action-parity.manifest.json --observations observations.jsonl --artifact-dir artifacts
```

Exit code `0` means verified, `2` means evidence was processed but parity failed, and `1` means invalid or unsafe input.

See [`examples/basic`](examples/basic) for a mutation whose CLI, MCP and GUI bindings share one core, including success and stale-state fixtures.

## Development

```sh
npm test
npm run check
```

MIT
