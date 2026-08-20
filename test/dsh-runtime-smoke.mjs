import assert from 'node:assert/strict'
import { cp, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const checkout = process.env.DSH_CHECKOUT
if (!checkout) throw new Error('DSH_CHECKOUT must point to a built DeepSeek Harness checkout')
const pluginEntry = process.env.PLUGIN_ENTRY
const plugin = pluginEntry ? await import(pathToFileURL(resolve(pluginEntry)).href) : await import('../index.js')
const importBuilt = relative => import(pathToFileURL(resolve(checkout, relative)).href)
const { Context } = await importBuilt('vendor/cordis/lib/index.js')
const { default: SystemPrompt } = await importBuilt('packages/core/system-prompt/lib/index.js')
const { default: ToolRuntime } = await importBuilt('packages/core/tools/lib/index.js')
const { TokenMeter } = await importBuilt('packages/llm/token-meter/lib/index.js')

const root = await mkdtemp(join(tmpdir(), 'dsh-action-parity-runtime-'))
await cp(new URL('../examples/basic/', import.meta.url), root, { recursive: true })
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(plugin, { workspaceRoot: root })
  const tools = ctx.get('tools')
  const names = tools.schemas().filter(({ name }) => name.startsWith('dsh_action_parity_')).map(({ name }) => name)
  assert.deepEqual(names, ['dsh_action_parity_inspect', 'dsh_action_parity_verify'])
  const inspect = await tools.execute({ signal: new AbortController().signal, callId: 'parity-inspect', name: 'dsh_action_parity_inspect', arguments: { manifestPath: 'action-parity.manifest.json' } }, {})
  assert.equal(inspect.isError, false)
  assert.equal(inspect.value.executesActions, false)
  const verify = await tools.execute({ signal: new AbortController().signal, callId: 'parity-verify', name: 'dsh_action_parity_verify', arguments: { manifestPath: 'action-parity.manifest.json', observationsPath: 'observations.jsonl', artifactDir: 'artifacts' } }, {})
  assert.equal(verify.isError, false)
  assert.equal(verify.value.status, 'verified')
  assert.equal(verify.value.artifact.verifiedByReadBack, true)
  process.stdout.write(`${JSON.stringify({ ok: true, dshTools: names, status: verify.value.status, cases: verify.value.cases.length, artifact: verify.value.artifact })}\n`)
} finally {
  await ctx.fiber.dispose()
}
