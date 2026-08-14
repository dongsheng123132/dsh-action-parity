export function updateItem(state, request) {
  if (request.expectedStateVersion !== state.version) return { ok: false, code: 'STALE_STATE', version: state.version }
  return { ok: true, version: String(Number(state.version) + 1) }
}
