import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requirements, sha256, validateState, validateRendererBuild } from './react-migration.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'launcher-react-harness-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const docRoot = join(root, 'docs/react-migration')
  mkdirSync(docRoot, { recursive: true })
  for (const name of ['PLAN.md', 'SCOPE.md', 'evidence.md']) writeFileSync(join(docRoot, name), name, 'utf8')
  const ref = name => ({ path: `docs/react-migration/${name}`, sha256: sha256(name) })
  const state = {
    schemaVersion: 1, plan: ref('PLAN.md'), scope: ref('SCOPE.md'), currentStage: 0,
    nextAction: 'Inventariar funciones conservadas',
    stages: requirements.map((ids, id) => ({ id, status: id === 0 ? 'active' : 'pending', gates: ids.map(id => ({ id, status: 'pending', evidence: [] })) })),
  }
  return { root, state, ref }
}

test('una etapa activa con criterios pendientes es un estado válido, no una etapa terminada', t => {
  const { root, state } = fixture(t)
  assert.deepEqual(validateState(state, root), [])
})

test('selector conserva Vue como default y no admite sustituir su entrada', () => {
  const pkg = { scripts: { 'build:renderer': 'tsx scripts/renderer.ts build' } }
  const targets = { default: 'vue', vue: { package: 'xmcl-keystone-ui' }, react: { package: 'xmcl-react-ui' } }
  assert.deepEqual(validateRendererBuild(pkg, targets), [])
  assert.equal(validateRendererBuild(pkg, { ...targets, default: 'react' }).length, 1)
  assert.equal(validateRendererBuild({ scripts: { 'build:renderer': 'other' } }, targets).length, 1)
})

test('detecta cambios accidentales del plan y del alcance aprobado', t => {
  const { root, state } = fixture(t)
  for (const file of ['PLAN.md', 'SCOPE.md']) writeFileSync(join(root, 'docs/react-migration', file), 'cambio', 'utf8')
  assert.equal(validateState(state, root).filter(error => error.includes('SHA-256')).length, 2)
})

test('impide saltar una etapa pendiente', t => {
  const { root, state } = fixture(t)
  state.currentStage = 1
  state.stages[0].status = 'pending'
  state.stages[1].status = 'active'
  assert.match(validateState(state, root).join('\n'), /No se puede saltar/)
})

test('no admite declarar completa una etapa con criterios pendientes', t => {
  const { root, state } = fixture(t)
  state.stages[0].status = 'complete'
  assert.match(validateState(state, root).join('\n'), /Etapa 0 incompleta/)
})

test('detecta criterios eliminados o duplicados', t => {
  const { root, state } = fixture(t)
  state.stages[0].gates[1].id = state.stages[0].gates[0].id
  assert.match(validateState(state, root).join('\n'), /Criterios incompletos o duplicados/)
})

test('no admite un criterio aprobado sin evidencia ni evidencia alterada', t => {
  const { root, state, ref } = fixture(t)
  const gate = state.stages[0].gates[0]
  gate.status = 'passed'
  assert.match(validateState(state, root).join('\n'), /Falta evidencia/)
  gate.evidence = [ref('evidence.md')]
  assert.deepEqual(validateState(state, root), [])
  writeFileSync(join(root, 'docs/react-migration/evidence.md'), 'otra cosa', 'utf8')
  assert.match(validateState(state, root).join('\n'), /SHA-256/)
})

test('rechaza referencias de evidencia fuera del repositorio', t => {
  const { root, state } = fixture(t)
  state.stages[0].gates[0] = { id: 'plan-scope', status: 'passed', evidence: [{ path: 'C:\\private\\secret', sha256: 'a'.repeat(64) }] }
  assert.match(validateState(state, root).join('\n'), /relativa al repositorio/)
})

test('una IA no puede sustituir la aprobación visual del usuario por su propia revisión', t => {
  const { root, state, ref } = fixture(t)
  const review = state.stages[1].gates.find(gate => gate.id === 'user-design-review')
  review.status = 'passed'
  review.evidence = [ref('evidence.md')]
  review.approval = { source: 'agent', reference: 'se ve bien' }
  assert.match(validateState(state, root).join('\n'), /aprobación real del usuario/)
})
