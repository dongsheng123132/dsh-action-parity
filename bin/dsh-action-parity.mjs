#!/usr/bin/env node
import { inspectActionParity, verifyActionParity } from '../lib/action-parity.mjs'

const [command, ...rest] = process.argv.slice(2)
const args = {}
for (let index = 0; index < rest.length; index += 1) if (rest[index].startsWith('--')) args[rest[index].slice(2)] = rest[index + 1]
const usage = () => process.stderr.write('Usage:\n  dsh-action-parity inspect --workspace-root DIR --manifest FILE\n  dsh-action-parity verify --workspace-root DIR --manifest FILE --observations FILE --artifact-dir DIR\n')

try {
  let result
  if (command === 'inspect' && args.manifest) result = await inspectActionParity({ workspaceRoot: args['workspace-root'] ?? process.cwd(), manifestPath: args.manifest })
  else if (command === 'verify' && args.manifest && args.observations && args['artifact-dir']) result = await verifyActionParity({ workspaceRoot: args['workspace-root'] ?? process.cwd(), manifestPath: args.manifest, observationsPath: args.observations, artifactDir: args['artifact-dir'] })
  else { usage(); process.exitCode = 1 }
  if (result) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (command === 'verify' && result.status !== 'verified') process.exitCode = 2
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error.code ?? 'ERROR', error: error.message })}\n`)
  process.exitCode = 1
}
