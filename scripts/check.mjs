import { readFile } from 'node:fs/promises'

const required = ['package.json', '.codex-plugin/plugin.json', '.mcp.json', 'index.js', 'lib/action-parity.mjs', 'bin/dsh-action-parity.mjs', 'cordis.patch.yml', 'mcp-server.mjs', 'examples/basic/action-parity.manifest.json', 'examples/basic/observations.jsonl', 'README.md', 'README.zh-CN.md', 'SECURITY.md']
const files = Object.fromEntries(await Promise.all(required.map(async file => [file, await readFile(new URL(`../${file}`, import.meta.url), 'utf8')])))
const pkg = JSON.parse(files['package.json'])
const plugin = JSON.parse(files['.codex-plugin/plugin.json'])
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('missing DSH bundle patch')
if (pkg.name !== plugin.name || pkg.version !== plugin.version) throw new Error('package/plugin identity mismatch')
if (plugin.mcpServers !== './.mcp.json') throw new Error('Codex plugin must declare the MCP companion')
if (!files['.mcp.json'].includes('mcp-server.mjs')) throw new Error('MCP declaration is missing its server')
if (pkg.scripts?.preinstall || pkg.scripts?.install || pkg.scripts?.postinstall || pkg.scripts?.prepare) throw new Error('lifecycle scripts are forbidden')
if (/export\s+default\b/.test(files['index.js'])) throw new Error('default export is forbidden: stock DSH Loader must receive namespace inject metadata')
if (!files['cordis.patch.yml'].includes('name: dsh-action-parity')) throw new Error('bundle does not mount dsh-action-parity')
for (const tool of ['dsh_action_parity_inspect', 'dsh_action_parity_verify']) {
  if (!files['index.js'].includes(`name: '${tool}'`)) throw new Error(`missing tool ${tool}`)
}
for (const guard of ['STALE_STATE', 'CROSS_SURFACE_DIVERGENCE', 'CONFIRMATION_NOT_ENFORCED', 'escapes workspaceRoot', 'non-symlink file', 'verifiedByReadBack', 'declarationContentVerification']) {
  if (!files['lib/action-parity.mjs'].includes(guard)) throw new Error(`guard missing: ${guard}`)
}
for (const shared of ['inspectActionParityManifestJson', 'verifyActionParityObservationsJsonl']) {
  if (!files['mcp-server.mjs'].includes(shared)) throw new Error(`MCP must use shared core ${shared}`)
}
process.stdout.write(`${JSON.stringify({ ok: true, requiredFiles: required.length, dshBundle: pkg.dsh.bundle.patch, codexManifest: true, tools: 2, guards: 7, mcp: true, namespaceLoaderSafe: true, lifecycleScripts: false })}\n`)
