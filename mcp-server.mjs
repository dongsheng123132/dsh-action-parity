#!/usr/bin/env node
import readline from 'node:readline'
import { inspectActionParityManifestJson, verifyActionParityObservationsJsonl } from './lib/action-parity.mjs'

const MAX_LINE_BYTES = 6 * 1024 * 1024
const tools = [
  {
    name: 'action_parity_manifest_inspect',
    description: 'Validate a bounded inline action-parity manifest and return stable Action IDs and binding identifiers without filesystem access or action execution.',
    inputSchema: { type: 'object', required: ['manifestJson'], additionalProperties: false, properties: { manifestJson: { type: 'string', maxLength: 1_048_576 } } }
  },
  {
    name: 'action_parity_observations_verify',
    description: 'Verify bounded inline CLI/MCP/GUI replay observations for cross-surface semantic parity, stale conflicts and confirmation enforcement without dereferencing declarations or executing actions.',
    inputSchema: {
      type: 'object', required: ['manifestJson', 'observationsJsonl'], additionalProperties: false,
      properties: { manifestJson: { type: 'string', maxLength: 1_048_576 }, observationsJsonl: { type: 'string', maxLength: 4_194_304 } }
    }
  }
]

function call(name, args) {
  if (name === 'action_parity_manifest_inspect') return inspectActionParityManifestJson(args.manifestJson)
  if (name === 'action_parity_observations_verify') return verifyActionParityObservationsJsonl(args.manifestJson, args.observationsJsonl)
  throw new Error('Unknown tool')
}

const send = value => process.stdout.write(`${JSON.stringify(value)}\n`)
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of lines) {
  if (!line.trim() || Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) continue
  let request
  try { request = JSON.parse(line) } catch { continue }
  if (request.id === undefined) continue
  try {
    if (request.method === 'initialize') {
      send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dsh-action-parity', version: '0.2.0' } } })
    } else if (request.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: request.id, result: { tools } })
    } else if (request.method === 'tools/call') {
      const result = call(request.params?.name, request.params?.arguments ?? {})
      send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } })
    } else {
      send({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } })
    }
  } catch (error) {
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error.message, data: { code: error.code ?? 'INVALID_ACTION_PARITY_EVIDENCE' } } })
  }
}
