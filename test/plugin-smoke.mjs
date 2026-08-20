import assert from 'node:assert/strict'
import * as plugin from '../index.js'

assert.equal('default' in plugin, false)
assert.equal(plugin.name, 'dsh-action-parity')
assert.deepEqual(plugin.inject, ['tools'])
const definitions = plugin.createDefinitions({}, { workspaceRoot: process.cwd() })
assert.deepEqual(definitions.map(({ name }) => name), ['dsh_action_parity_inspect', 'dsh_action_parity_verify'])
process.stdout.write(`${JSON.stringify({ ok: true, namespaceLoaderSafe: true, tools: definitions.map(({ name }) => name) })}\n`)
