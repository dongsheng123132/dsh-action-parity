import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const manifestJson = await readFile('examples/basic/action-parity.manifest.json', 'utf8')
const observationsJsonl = await readFile('examples/basic/observations.jsonl', 'utf8')
const first = JSON.parse(observationsJsonl.trim().split(/\r?\n/)[0])
const forbiddenJsonl = `${JSON.stringify({ ...first, idempotencyKey: 'secret-observation', apiToken: 'do-not-echo' })}\n`
const child = spawn(process.execPath, ['mcp-server.mjs'], { cwd: process.cwd(), shell: false, stdio: ['pipe', 'pipe', 'inherit'] })
let output = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', chunk => { output += chunk })
const request = value => child.stdin.write(`${JSON.stringify(value)}\n`)
request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })
request({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'action_parity_manifest_inspect', arguments: { manifestJson } } })
request({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'action_parity_observations_verify', arguments: { manifestJson, observationsJsonl } } })
request({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'action_parity_observations_verify', arguments: { manifestJson, observationsJsonl: forbiddenJsonl } } })
child.stdin.end()
await new Promise((resolve, reject) => {
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`MCP exited ${code}`)))
  child.on('error', reject)
})
const messages = output.trim().split(/\r?\n/).map(JSON.parse)
assert.equal(messages[0].result.serverInfo.version, '0.2.0')
assert.deepEqual(messages[1].result.tools.map(({ name }) => name), ['action_parity_manifest_inspect', 'action_parity_observations_verify'])
assert.equal(messages[2].result.structuredContent.executesActions, false)
assert.equal(messages[3].result.structuredContent.status, 'structurally-verified')
assert.equal(messages[3].result.structuredContent.declarationContentVerification, 'not-performed')
assert.match(messages[4].error.message, /Forbidden raw or secret-shaped field/)
assert.doesNotMatch(output, /do-not-echo/)
process.stdout.write(`${JSON.stringify({ ok: true, tools: messages[1].result.tools.map(({ name }) => name), proofOnly: true, secretFieldRejected: true })}\n`)
