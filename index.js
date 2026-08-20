import { inspectActionParity, verifyActionParity } from './lib/action-parity.mjs'

export const name = 'dsh-action-parity'
export const inject = ['tools']
const renderJson = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const base = (config, args) => ({ workspaceRoot: config.workspaceRoot ?? process.cwd(), manifestPath: args.manifestPath, observationsPath: args.observationsPath, artifactDir: args.artifactDir })
const defineJsonTool = ({ name, description, parameters, execute }) => ({
  name,
  description,
  parameters: {
    type: 'object',
    properties: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { type: 'string', description: value.description }])),
    required: Object.entries(parameters).filter(([, value]) => value.required).map(([key]) => key),
    additionalProperties: false
  },
  output: { schema: {}, render: renderJson },
  execute(args) {
    for (const [key, value] of Object.entries(parameters)) {
      if (value.required && (typeof args?.[key] !== 'string' || args[key].length === 0)) throw new TypeError(`${key} must be a non-empty string`)
    }
    return execute(args)
  }
})

export function createDefinitions(_ctx, config = {}) {
  return [
    defineJsonTool({
      name: 'dsh_action_parity_inspect',
      description: 'Inspect stable Action IDs, required surfaces, core and binding hashes without reading source contents or executing actions.',
      parameters: { manifestPath: { type: 'string', required: true, description: 'Action parity manifest relative to workspaceRoot.' } },
      execute(args) { return inspectActionParity(base(config, args)) }
    }),
    defineJsonTool({
      name: 'dsh_action_parity_verify',
      description: 'Verify content-addressed CLI/MCP/GUI bindings and replay observations against one action core, including state-version conflict and confirmation parity. Does not execute business actions.',
      parameters: {
        manifestPath: { type: 'string', required: true, description: 'Action parity manifest relative to workspaceRoot.' },
        observationsPath: { type: 'string', required: true, description: 'Structural replay observations JSONL relative to workspaceRoot.' },
        artifactDir: { type: 'string', required: true, description: 'Only report directory that may be written, relative to workspaceRoot.' }
      },
      execute(args) { return verifyActionParity(base(config, args)) }
    })
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createDefinitions(ctx, config)) ctx.tools.register(definition)
}
