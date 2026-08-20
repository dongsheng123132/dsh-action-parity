# Security policy

`dsh-action-parity` validates structural evidence; it never executes a business action.

- DSH and CLI file access is confined to an explicit `workspaceRoot`. Inputs must be regular, non-symlink files. The only write surface is an explicit workspace-relative `artifactDir`; reports are content-addressed and verified after write.
- The MCP server is proof-only: it accepts bounded inline manifest JSON and observation JSONL, does not access the filesystem or network, and does not execute CLI, MCP, GUI, or action-core code.
- Credential-, prompt-, message-, raw input/output-, argv-, stdout- and stderr-shaped fields are rejected. Source contents and secret values are never copied into reports or errors.
- The package has no install lifecycle scripts and spawns no shell.

Report vulnerabilities privately through GitHub Security Advisories for this repository. Do not include live secrets, proprietary source, or original business payloads in a report.
