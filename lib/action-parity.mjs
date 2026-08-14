import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SURFACES = ['cli', 'mcp', 'gui']
const MAX_MANIFEST_BYTES = 1_048_576
const MAX_OBSERVATIONS_BYTES = 4_194_304
const MAX_EVIDENCE_BYTES = 4_194_304
const FORBIDDEN_KEYS = /^(authorization|secret|token|password|credential|chat|prompt|message|content|text|input|output|stdout|stderr|argv)$/i
const ACTION_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/

export class ActionParityError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ActionParityError'
    this.code = code
    this.details = details
  }
}

const digest = (value) => createHash('sha256').update(value).digest('hex')
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`
const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ActionParityError('INVALID_SCHEMA', `${label} must be an object`)
}

function noSecrets(value, at = '$') {
  if (Array.isArray(value)) return value.forEach((item, index) => noSecrets(item, `${at}[${index}]`))
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new ActionParityError('FORBIDDEN_FIELD', `Forbidden raw or secret-shaped field at ${at}.${key}`)
    noSecrets(child, `${at}.${key}`)
  }
}

async function rootPath(workspaceRoot) {
  const root = await realpath(workspaceRoot)
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new ActionParityError('UNSAFE_PATH', 'workspaceRoot must be a real directory')
  return root
}

async function safeFile(workspaceRoot, relativePath, label, maxBytes) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) throw new ActionParityError('UNSAFE_PATH', `${label} must be a workspace-relative path`)
  const root = await rootPath(workspaceRoot)
  const target = path.resolve(root, relativePath)
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new ActionParityError('UNSAFE_PATH', `${label} escapes workspaceRoot`)
  const info = await lstat(target)
  if (info.isSymbolicLink() || !info.isFile()) throw new ActionParityError('UNSAFE_PATH', `${label} must be a regular non-symlink file`)
  if (info.size > maxBytes) throw new ActionParityError('INPUT_TOO_LARGE', `${label} exceeds ${maxBytes} bytes`)
  const resolved = await realpath(target)
  const resolvedRel = path.relative(root, resolved)
  if (resolvedRel.startsWith('..') || path.isAbsolute(resolvedRel)) throw new ActionParityError('UNSAFE_PATH', `${label} resolves outside workspaceRoot`)
  return { root, target: resolved }
}

async function safeArtifactDir(workspaceRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) throw new ActionParityError('UNSAFE_PATH', 'artifactDir must be a workspace-relative path')
  const root = await rootPath(workspaceRoot)
  const target = path.resolve(root, relativePath)
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new ActionParityError('UNSAFE_PATH', 'artifactDir escapes workspaceRoot')
  await mkdir(target, { recursive: true })
  const info = await lstat(target)
  if (info.isSymbolicLink() || !info.isDirectory()) throw new ActionParityError('UNSAFE_PATH', 'artifactDir must be a real directory')
  const resolved = await realpath(target)
  const resolvedRel = path.relative(root, resolved)
  if (resolvedRel.startsWith('..') || path.isAbsolute(resolvedRel)) throw new ActionParityError('UNSAFE_PATH', 'artifactDir resolves outside workspaceRoot')
  return { root, target: resolved }
}

function expectedBindingId(surface, actionId) {
  return surface === 'gui' ? `data-action-id:${actionId}` : `${surface}:${actionId}`
}

function validateManifest(manifest) {
  plain(manifest, 'manifest')
  noSecrets(manifest)
  if (manifest.schemaVersion !== 1) throw new ActionParityError('INVALID_SCHEMA', 'schemaVersion must be 1')
  plain(manifest.system, 'system')
  if (typeof manifest.system.name !== 'string' || typeof manifest.system.revision !== 'string') throw new ActionParityError('INVALID_SCHEMA', 'system.name and system.revision are required strings')
  if (!Array.isArray(manifest.requiredSurfaces) || JSON.stringify([...manifest.requiredSurfaces].sort()) !== JSON.stringify([...SURFACES].sort())) throw new ActionParityError('INVALID_SCHEMA', 'requiredSurfaces must be exactly cli, mcp and gui')
  if (!Array.isArray(manifest.actions) || manifest.actions.length === 0) throw new ActionParityError('INVALID_SCHEMA', 'actions must be a non-empty array')
  const actionIds = new Set()
  const caseIds = new Set()
  for (const [index, action] of manifest.actions.entries()) {
    plain(action, `actions[${index}]`)
    if (!ACTION_ID.test(action.actionId) || actionIds.has(action.actionId)) throw new ActionParityError('INVALID_SCHEMA', `actions[${index}].actionId must be unique and stable`)
    if (!['query', 'mutation'].includes(action.kind) || !['never', 'required'].includes(action.confirmation)) throw new ActionParityError('INVALID_SCHEMA', `actions[${index}] kind or confirmation is invalid`)
    plain(action.core, `actions[${index}].core`)
    if (typeof action.core.path !== 'string' || !isHash(action.core.sha256) || typeof action.core.export !== 'string' || action.core.export.length === 0) throw new ActionParityError('INVALID_SCHEMA', `actions[${index}].core is invalid`)
    if (!Array.isArray(action.bindings) || action.bindings.length !== SURFACES.length) throw new ActionParityError('INVALID_SCHEMA', `actions[${index}] needs exactly three bindings`)
    const surfaces = new Set()
    for (const binding of action.bindings) {
      plain(binding, `binding for ${action.actionId}`)
      if (!SURFACES.includes(binding.surface) || surfaces.has(binding.surface)) throw new ActionParityError('INVALID_SCHEMA', `${action.actionId} has duplicate or unknown binding surface`)
      if (binding.coreActionId !== action.actionId || binding.bindingId !== expectedBindingId(binding.surface, action.actionId)) throw new ActionParityError('INVALID_SCHEMA', `${action.actionId}/${binding.surface} does not bind the stable Action ID`)
      if (typeof binding.path !== 'string' || !isHash(binding.sha256)) throw new ActionParityError('INVALID_SCHEMA', `${action.actionId}/${binding.surface} declaration evidence is invalid`)
      surfaces.add(binding.surface)
    }
    if (!Array.isArray(action.cases) || action.cases.length === 0) throw new ActionParityError('INVALID_SCHEMA', `${action.actionId} needs replay cases`)
    for (const replayCase of action.cases) {
      plain(replayCase, `case for ${action.actionId}`)
      const qualifiedId = `${action.actionId}:${replayCase.id}`
      if (typeof replayCase.id !== 'string' || caseIds.has(qualifiedId) || !['success', 'stale-conflict'].includes(replayCase.kind)) throw new ActionParityError('INVALID_SCHEMA', `${action.actionId} has an invalid or duplicate case`)
      plain(replayCase.fixture, `${qualifiedId}.fixture`)
      plain(replayCase.expected, `${qualifiedId}.expected`)
      if (typeof replayCase.fixture.path !== 'string' || !isHash(replayCase.fixture.sha256) || !isHash(replayCase.expected.resultSha256)) throw new ActionParityError('INVALID_SCHEMA', `${qualifiedId} hashes are invalid`)
      if (typeof replayCase.expected.success !== 'boolean' || typeof replayCase.expected.stateVersionBefore !== 'string' || typeof replayCase.expected.stateVersionAfter !== 'string') throw new ActionParityError('INVALID_SCHEMA', `${qualifiedId} expected state is invalid`)
      if (replayCase.expected.conflictCode !== null && typeof replayCase.expected.conflictCode !== 'string') throw new ActionParityError('INVALID_SCHEMA', `${qualifiedId} conflictCode is invalid`)
      if (replayCase.kind === 'stale-conflict' && (replayCase.expected.success !== false || replayCase.expected.stateVersionAfter !== replayCase.expected.stateVersionBefore || replayCase.expected.conflictCode !== 'STALE_STATE')) throw new ActionParityError('INVALID_SCHEMA', `${qualifiedId} stale conflict must fail closed without changing state`)
      caseIds.add(qualifiedId)
    }
    actionIds.add(action.actionId)
  }
  return manifest
}

async function loadJson(workspaceRoot, relativePath, label, maxBytes) {
  const { target } = await safeFile(workspaceRoot, relativePath, label, maxBytes)
  const bytes = await readFile(target)
  let value
  try { value = JSON.parse(bytes.toString('utf8')) } catch { throw new ActionParityError('INVALID_JSON', `${label} is not valid JSON`) }
  return { value, sha256: digest(bytes) }
}

async function evidenceStatus(workspaceRoot, evidence, label) {
  try {
    const { target } = await safeFile(workspaceRoot, evidence.path, label, MAX_EVIDENCE_BYTES)
    const actualSha256 = digest(await readFile(target))
    return { expectedSha256: evidence.sha256, actualSha256, status: actualSha256 === evidence.sha256 ? 'current' : 'stale' }
  } catch (error) {
    if (error?.code === 'ENOENT') return { expectedSha256: evidence.sha256, actualSha256: null, status: 'missing' }
    throw error
  }
}

async function verifyEvidence(workspaceRoot, manifest) {
  const actions = []
  for (const action of manifest.actions) {
    const core = await evidenceStatus(workspaceRoot, action.core, `${action.actionId}.core.path`)
    const bindings = []
    for (const binding of action.bindings) bindings.push({ surface: binding.surface, bindingId: binding.bindingId, coreActionId: binding.coreActionId, ...await evidenceStatus(workspaceRoot, binding, `${action.actionId}.${binding.surface}.path`) })
    const cases = []
    for (const replayCase of action.cases) cases.push({ id: replayCase.id, ...await evidenceStatus(workspaceRoot, replayCase.fixture, `${action.actionId}.${replayCase.id}.fixture.path`) })
    actions.push({ actionId: action.actionId, core, bindings, cases })
  }
  return actions
}

function validateObservation(value, line, manifest, seen) {
  plain(value, `observation line ${line}`)
  noSecrets(value, `$observation[${line}]`)
  const action = manifest.actions.find(({ actionId }) => actionId === value.actionId)
  const replayCase = action?.cases.find(({ id }) => id === value.caseId)
  if (value.eventVersion !== 1 || typeof value.idempotencyKey !== 'string' || seen.has(value.idempotencyKey)) throw new ActionParityError('INVALID_OBSERVATION', `line ${line} needs eventVersion 1 and a unique idempotencyKey`)
  if (!action || !replayCase || !SURFACES.includes(value.surface) || value.coreActionId !== value.actionId) throw new ActionParityError('INVALID_OBSERVATION', `line ${line} references an unknown action, case, surface or core`)
  if (!isHash(value.fixtureSha256) || !isHash(value.resultSha256) || typeof value.success !== 'boolean' || typeof value.stateVersionBefore !== 'string' || typeof value.stateVersionAfter !== 'string' || typeof value.confirmationEnforced !== 'boolean') throw new ActionParityError('INVALID_OBSERVATION', `line ${line} has invalid structural evidence`)
  if (value.conflictCode !== null && typeof value.conflictCode !== 'string') throw new ActionParityError('INVALID_OBSERVATION', `line ${line} conflictCode must be a string or null`)
  seen.add(value.idempotencyKey)
  return value
}

async function loadObservations(workspaceRoot, observationsPath, manifest) {
  const { target } = await safeFile(workspaceRoot, observationsPath, 'observationsPath', MAX_OBSERVATIONS_BYTES)
  const raw = await readFile(target, 'utf8')
  const seen = new Set()
  const observations = raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    let value
    try { value = JSON.parse(line) } catch { throw new ActionParityError('INVALID_JSONL', `observationsPath line ${index + 1} is not valid JSON`) }
    return validateObservation(value, index + 1, manifest, seen)
  })
  return { observations, sha256: digest(raw) }
}

function verifyCases(manifest, observations) {
  const results = []
  for (const action of manifest.actions) for (const replayCase of action.cases) {
    const actual = observations.filter((item) => item.actionId === action.actionId && item.caseId === replayCase.id)
    const findings = []
    const surfaces = actual.map(({ surface }) => surface).sort()
    if (JSON.stringify(surfaces) !== JSON.stringify([...SURFACES].sort())) findings.push({ code: 'SURFACE_COVERAGE_MISMATCH', expected: SURFACES, actual: surfaces })
    for (const observation of actual) {
      if (observation.fixtureSha256 !== replayCase.fixture.sha256) findings.push({ code: 'FIXTURE_HASH_MISMATCH', surface: observation.surface })
      for (const field of ['resultSha256', 'success', 'stateVersionBefore', 'stateVersionAfter', 'conflictCode']) if (observation[field] !== replayCase.expected[field]) findings.push({ code: 'EXPECTED_RESULT_MISMATCH', surface: observation.surface, field })
      if (action.confirmation === 'required' && !observation.confirmationEnforced) findings.push({ code: 'CONFIRMATION_NOT_ENFORCED', surface: observation.surface })
    }
    const signatures = new Set(actual.map((item) => JSON.stringify([item.fixtureSha256, item.resultSha256, item.success, item.stateVersionBefore, item.stateVersionAfter, item.conflictCode, item.confirmationEnforced])))
    if (signatures.size > 1) findings.push({ code: 'CROSS_SURFACE_DIVERGENCE' })
    results.push({ actionId: action.actionId, caseId: replayCase.id, kind: replayCase.kind, status: findings.length ? 'failed' : 'verified', surfaces, findings })
  }
  return results
}

async function writeReport(workspaceRoot, artifactDir, report) {
  const { root, target: directory } = await safeArtifactDir(workspaceRoot, artifactDir)
  const body = stableJson(report)
  const sha256 = digest(body)
  const filename = `action-parity-${sha256}.json`
  const target = path.join(directory, filename)
  const temporary = path.join(directory, `.${filename}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, body, { encoding: 'utf8', flag: 'wx' })
    try { await link(temporary, target) } catch (error) { if (error.code !== 'EEXIST') throw error }
    const reread = await readFile(target, 'utf8')
    if (digest(reread) !== sha256 || reread !== body) throw new ActionParityError('WRITE_VERIFY_FAILED', 'report failed content-addressed read-back verification')
    return { path: path.relative(root, target).replaceAll(path.sep, '/'), sha256 }
  } finally {
    try { await unlink(temporary) } catch {}
  }
}

export async function inspectActionParity({ workspaceRoot = process.cwd(), manifestPath }) {
  const { value, sha256: manifestSha256 } = await loadJson(workspaceRoot, manifestPath, 'manifestPath', MAX_MANIFEST_BYTES)
  const manifest = validateManifest(value)
  return { schemaVersion: 1, operation: 'inspect', executesActions: false, system: manifest.system, manifestSha256, requiredSurfaces: manifest.requiredSurfaces, actions: manifest.actions.map((action) => ({ actionId: action.actionId, kind: action.kind, confirmation: action.confirmation, core: { export: action.core.export, expectedSha256: action.core.sha256 }, bindings: action.bindings.map(({ surface, bindingId, coreActionId, sha256 }) => ({ surface, bindingId, coreActionId, expectedSha256: sha256 })), cases: action.cases.map(({ id, kind, fixture }) => ({ id, kind, fixtureSha256: fixture.sha256 })) })) }
}

export async function verifyActionParity({ workspaceRoot = process.cwd(), manifestPath, observationsPath, artifactDir }) {
  const { value, sha256: manifestSha256 } = await loadJson(workspaceRoot, manifestPath, 'manifestPath', MAX_MANIFEST_BYTES)
  const manifest = validateManifest(value)
  const { observations, sha256: observationsSha256 } = await loadObservations(workspaceRoot, observationsPath, manifest)
  const evidence = await verifyEvidence(workspaceRoot, manifest)
  const cases = verifyCases(manifest, observations)
  const allEvidence = evidence.flatMap((action) => [{ id: `${action.actionId}:core`, ...action.core }, ...action.bindings.map((item) => ({ id: `${action.actionId}:${item.surface}`, ...item })), ...action.cases.map((item) => ({ id: `${action.actionId}:case:${item.id}`, ...item }))])
  const stale = allEvidence.filter(({ status }) => status === 'stale').map(({ id }) => id)
  const missing = allEvidence.filter(({ status }) => status === 'missing').map(({ id }) => id)
  const report = { schemaVersion: 1, operation: 'verify', executesActions: false, system: manifest.system, inputs: { manifestSha256, observationsSha256 }, status: stale.length === 0 && missing.length === 0 && cases.every(({ status }) => status === 'verified') ? 'verified' : 'failed', disclosure: { staleEvidenceIds: stale, missingEvidenceIds: missing }, evidence, cases }
  const artifact = await writeReport(workspaceRoot, artifactDir, report)
  return { ...report, artifact }
}
