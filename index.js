import { defineTool } from '@deepseek-ai/dsh-tools'
import { inspectActionParity, verifyActionParity } from './lib/action-parity.mjs'

export const name = 'dsh-action-parity'
export const inject = ['tools']
const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const base = (config, args) => ({ workspaceRoot: config.workspaceRoot ?? process.cwd(), manifestPath: args.manifestPath, observationsPath: args.observationsPath, artifactDir: args.artifactDir })

export function createDefinitions(_ctx, config = {}) {
  return [
    defineTool({
      name: 'dsh_action_parity_inspect',
      description: 'Inspect stable Action IDs, required surfaces, core and binding hashes without reading source contents or executing actions.',
      parameters: { manifestPath: { type: 'string', required: true, description: 'Action parity manifest relative to workspaceRoot.' } },
      output: { schema: { type: 'json' }, render: renderJson },
      execute(args) { return inspectActionParity(base(config, args)) }
    }),
    defineTool({
      name: 'dsh_action_parity_verify',
      description: 'Verify content-addressed CLI/MCP/GUI bindings and replay observations against one action core, including state-version conflict and confirmation parity. Does not execute business actions.',
      parameters: {
        manifestPath: { type: 'string', required: true, description: 'Action parity manifest relative to workspaceRoot.' },
        observationsPath: { type: 'string', required: true, description: 'Structural replay observations JSONL relative to workspaceRoot.' },
        artifactDir: { type: 'string', required: true, description: 'Only report directory that may be written, relative to workspaceRoot.' }
      },
      output: { schema: { type: 'json' }, render: renderJson },
      execute(args) { return verifyActionParity(base(config, args)) }
    })
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createDefinitions(ctx, config)) ctx.tools.register(definition)
}

export default apply
