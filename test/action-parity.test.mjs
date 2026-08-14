import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ActionParityError, inspectActionParity, verifyActionParity } from '../lib/action-parity.mjs'

const hash = (value) => createHash('sha256').update(value).digest('hex')

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-action-parity-'))
  await cp(new URL('../examples/basic/', import.meta.url), root, { recursive: true })
  return root
}

test('inspect exposes stable bindings and hashes without source contents', async () => {
  const root = await fixture()
  const result = await inspectActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json' })
  assert.equal(result.executesActions, false)
  assert.deepEqual(result.requiredSurfaces.sort(), ['cli', 'gui', 'mcp'])
  assert.equal(result.actions[0].bindings.find(({ surface }) => surface === 'gui').bindingId, 'data-action-id:inventory.item.update')
  assert.equal(JSON.stringify(result).includes('Update item'), false)
})

test('verifies cross-surface success and stale conflict into a content-addressed report', async () => {
  const root = await fixture()
  const result = await verifyActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json', observationsPath: 'observations.jsonl', artifactDir: 'artifacts' })
  assert.equal(result.status, 'verified')
  assert.equal(result.executesActions, false)
  assert.equal(result.cases.every(({ status }) => status === 'verified'), true)
  assert.match(result.artifact.path, /^artifacts\/action-parity-[a-f0-9]{64}\.json$/)
  assert.equal(hash(await readFile(path.join(root, result.artifact.path))), result.artifact.sha256)
})

test('discloses cross-surface result divergence and missing confirmation', async () => {
  const root = await fixture()
  const file = path.join(root, 'observations.jsonl')
  let raw = await readFile(file, 'utf8')
  raw = raw.replace('"idempotencyKey":"success-gui"', '"idempotencyKey":"success-gui","marker":"changed"').replace(/("idempotencyKey":"success-gui"[^\n]+?)"resultSha256":"[a-f0-9]{64}"/, '$1"resultSha256":"0000000000000000000000000000000000000000000000000000000000000000"').replace(/("idempotencyKey":"success-gui"[^\n]+?)"confirmationEnforced":true/, '$1"confirmationEnforced":false')
  await writeFile(file, raw)
  const result = await verifyActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json', observationsPath: 'observations.jsonl', artifactDir: 'artifacts' })
  assert.equal(result.status, 'failed')
  assert.equal(result.cases[0].findings.some(({ code }) => code === 'CROSS_SURFACE_DIVERGENCE'), true)
  assert.equal(result.cases[0].findings.some(({ code }) => code === 'CONFIRMATION_NOT_ENFORCED'), true)
})

test('discloses stale and missing declaration evidence', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'core', 'inventory-core.mjs'), 'tampered\n')
  await unlink(path.join(root, 'bindings', 'mcp.json'))
  const result = await verifyActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json', observationsPath: 'observations.jsonl', artifactDir: 'artifacts' })
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.disclosure.staleEvidenceIds, ['inventory.item.update:core'])
  assert.deepEqual(result.disclosure.missingEvidenceIds, ['inventory.item.update:mcp'])
})

test('rejects raw output and secret-shaped observation fields', async () => {
  const root = await fixture()
  const file = path.join(root, 'observations.jsonl')
  const lines = (await readFile(file, 'utf8')).trim().split(/\r?\n/)
  const first = JSON.parse(lines[0])
  first.stdout = 'must not enter evidence'
  lines[0] = JSON.stringify(first)
  await writeFile(file, `${lines.join('\n')}\n`)
  await assert.rejects(() => verifyActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json', observationsPath: 'observations.jsonl', artifactDir: 'artifacts' }), (error) => error instanceof ActionParityError && error.code === 'FORBIDDEN_FIELD')
})

test('rejects a GUI binding that does not expose the Action ID', async () => {
  const root = await fixture()
  const file = path.join(root, 'action-parity.manifest.json')
  const manifest = JSON.parse(await readFile(file, 'utf8'))
  manifest.actions[0].bindings.find(({ surface }) => surface === 'gui').bindingId = 'button:update'
  await writeFile(file, JSON.stringify(manifest))
  await assert.rejects(() => inspectActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json' }), /does not bind the stable Action ID/)
})

test('rejects traversal and symlink evidence paths', async () => {
  const root = await fixture()
  await assert.rejects(() => inspectActionParity({ workspaceRoot: root, manifestPath: '../action-parity.manifest.json' }), /escapes workspaceRoot/)
  const linkPath = path.join(root, 'linked-observations.jsonl')
  try {
    await symlink(path.join(root, 'observations.jsonl'), linkPath)
    await assert.rejects(() => verifyActionParity({ workspaceRoot: root, manifestPath: 'action-parity.manifest.json', observationsPath: 'linked-observations.jsonl', artifactDir: 'artifacts' }), /non-symlink file/)
  } catch (error) {
    if (error.code !== 'EPERM') throw error
  }
})
