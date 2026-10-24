import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const docs = 'docs/react-migration/'
export const requirements = [
  ['plan-scope', 'inventory-parity', 'baseline-package', 'baseline-visual', 'baseline-performance', 'harness-checks'],
  ['prototype', 'media', 'visual-tests', 'user-design-review'],
  ['build-selector', 'windows-build', 'packaged-boot'],
  ['service-state-contracts', 'tasks-events', 'i18n-preferences', 'strict-mode-cleanup'],
  ['onboarding-accounts', 'home-carousel', 'library-instance-launch'],
  ['instance-content', 'worlds-settings', 'console-isolation'],
  ['catalog-search', 'catalog-install', 'catalog-network-failures'],
  ['global-settings-updater', 'remaining-windows', 'accessibility'],
  ['react-default', 'removed-features', 'consumer-builds', 'data-compatibility'],
  ['full-validation', 'isolated-installer', 'performance-security', 'release-assets', 'publication'],
]

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function readReference(repoRoot, ref) {
  if (!ref || typeof ref.path !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '')) {
    throw new Error('Referencia de evidencia inválida')
  }
  if (isAbsolute(ref.path) || win32.isAbsolute(ref.path)) throw new Error('La evidencia debe ser relativa al repositorio')
  const absolute = realpathSync(resolve(repoRoot, ref.path))
  const within = relative(realpathSync(repoRoot), absolute)
  if (within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) {
    throw new Error('Evidencia fuera del repositorio')
  }
  if (!statSync(absolute).isFile()) throw new Error('La evidencia no es un archivo')
  if (sha256(readFileSync(absolute)) !== ref.sha256) throw new Error(`SHA-256 no coincide: ${ref.path}`)
}

export function validateState(state, repoRoot) {
  const errors = []
  const check = (fn) => { try { fn() } catch (error) { errors.push(error.message) } }
  if (state.schemaVersion !== 1) errors.push('schemaVersion debe ser 1')
  for (const key of ['plan', 'scope']) {
    check(() => readReference(repoRoot, state[key]))
    if (state[key]?.path !== `${docs}${key === 'plan' ? 'PLAN' : 'SCOPE'}.md`) errors.push(`Ruta ${key} inesperada`)
  }
  if (!Number.isInteger(state.currentStage) || state.currentStage < 0 || state.currentStage > 9) errors.push('Etapa activa inválida')
  if (!Array.isArray(state.stages) || state.stages.length !== requirements.length) {
    return [...errors, 'Deben existir las diez etapas del plan']
  }
  let active = 0
  state.stages.forEach((stage, index) => {
    if (stage.id !== index) errors.push(`Orden/identidad de etapa inválido: ${index}`)
    if (!['pending', 'active', 'awaiting_review', 'complete'].includes(stage.status)) errors.push(`Estado de etapa inválido: ${index}`)
    if (['active', 'awaiting_review'].includes(stage.status)) active++
    if (index < state.currentStage && stage.status !== 'complete') errors.push(`No se puede saltar la etapa ${index}`)
    if (index > state.currentStage && stage.status !== 'pending') errors.push(`La etapa futura ${index} debe seguir pendiente`)
    if (!Array.isArray(stage.gates) || stage.gates.length !== requirements[index].length ||
      requirements[index].some(id => stage.gates.filter(gate => gate.id === id).length !== 1)) {
      errors.push(`Criterios incompletos o duplicados: etapa ${index}`)
      return
    }
    for (const gate of stage.gates) {
      if (!['pending', 'passed', 'blocked'].includes(gate.status)) errors.push(`Estado de criterio inválido: ${gate.id}`)
      if (gate.status === 'passed') {
        if (!Array.isArray(gate.evidence) || gate.evidence.length === 0) errors.push(`Falta evidencia: ${gate.id}`)
        else gate.evidence.forEach(ref => check(() => readReference(repoRoot, ref)))
        if (gate.id === 'user-design-review' &&
          (gate.approval?.source !== 'user' || typeof gate.approval.reference !== 'string' || !gate.approval.reference.trim())) {
          errors.push('La revisión visual requiere una referencia a la aprobación real del usuario')
        }
      }
      if (stage.status === 'complete' && gate.status !== 'passed') errors.push(`Etapa ${index} incompleta: ${gate.id}`)
    }
  })
  if (active > 1) errors.push('Solo puede existir una etapa activa')
  const current = state.stages[state.currentStage]
  if (current && !['active', 'awaiting_review', 'complete'].includes(current.status)) errors.push('La etapa actual debe estar activa')
  if (current?.status === 'complete' && state.currentStage !== 9) errors.push('Actualizar currentStage a la siguiente etapa pendiente')
  if (typeof state.nextAction !== 'string' || !state.nextAction.trim()) errors.push('Falta siguiente acción')
  return errors
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}

function checkRepository(state) {
  const errors = []
  if (!/^[a-f0-9]{40}$/.test(state.baseline?.commit ?? '')) return ['Commit de referencia inválido']
  try { git('cat-file', '-e', `${state.baseline.commit}^{commit}`) } catch { errors.push('Commit de referencia no disponible') }
  const protectedChanges = git('diff', '--name-only', state.baseline.commit, '--',
    'launcher/e2e/specs/ci', 'launcher/e2e/specs/showcase/01-*.spec.ts',
    'launcher/e2e/specs/showcase/02-*.spec.ts', 'launcher/e2e/specs/showcase/03-*.spec.ts',
    'launcher/e2e/specs/showcase/04-*.spec.ts', 'launcher/e2e/specs/showcase/05-*.spec.ts')
  if (protectedChanges) errors.push(`Cambios en pruebas protegidas:\n${protectedChanges}`)
  const originalCheckout = sha256(realpathSync(root).replaceAll('\\', '/').toLowerCase()) === state.baseline.localCheckoutId
  for (const ref of state.baseline.preservedFiles ?? []) {
    if (!originalCheckout && !existsSync(resolve(root, ref.path))) continue
    try { readReference(root, ref) } catch (error) { errors.push(`Archivo del usuario alterado: ${error.message}`) }
  }
  if (state.currentStage < 8) {
    const pkg = JSON.parse(readFileSync(resolve(root, 'launcher/package.json'), 'utf8'))
    if (pkg.scripts['build:renderer'] !== 'pnpm --prefix=xmcl-keystone-ui build') {
      // shortcut: selector support can replace this guard in stage 2, but Vue must stay the default until stage 8.
      errors.push('El build público de referencia cambió antes de la etapa de sustitución; comprobar selector/default Vue')
    }
  }
  return errors
}

function inventory(state) {
  if (state.currentStage !== 0) throw new Error('El inventario beta.2 está cerrado; no sobrescribir la referencia de la etapa 0')
  const files = git('ls-files', '--', 'launcher/xmcl-keystone-ui/src', 'launcher/xmcl-keystone-ui/locales',
    'launcher/xmcl-electron-app/preload', 'launcher/xmcl-runtime-api/src').split('\n').filter(Boolean).sort()
  const records = files.filter(path => /\.(?:vue|tsx?|html|ya?ml|css)$/.test(path)).map(path => {
    const bytes = readFileSync(resolve(root, path))
    const source = bytes.toString('utf8')
    const unique = values => [...new Set(values)].sort()
    return {
      path, sha256: sha256(bytes),
      imports: unique([...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(match => match[1])),
      serviceKeyCandidates: unique(source.match(/\b[A-Za-z_$][\w$]*ServiceKey\b/g) ?? []),
      literalStorageKeys: unique([...source.matchAll(/(?:useLocalStorage|localStorage\.(?:getItem|setItem|removeItem))\(\s*(['"])([^'"]+)\1/g)].map(match => match[2])),
      literalTestIds: unique([...source.matchAll(/\bdata-testid="([^"]+)"/g)].map(match => match[1])),
    }
  })
  const ui = records.filter(file => file.path.startsWith('launcher/xmcl-keystone-ui/src/'))
  const result = {
    schemaVersion: 1, baselineCommit: state.baseline.commit,
    limitation: 'Inventario estático de archivos y referencias literales, no prueba de accesibilidad ni call graph completo; contrastar con PARITY y Electron. No incluye valores de almacenamiento ni archivos .env.',
    counts: {
      vue: ui.filter(file => file.path.endsWith('.vue')).length,
      composableTypescript: ui.filter(file => file.path.includes('/composables/') && file.path.endsWith('.ts')).length,
      html: ui.filter(file => file.path.endsWith('.html')).length,
      locales: records.filter(file => file.path.includes('/locales/')).length,
      files: records.length,
    },
    files: records,
  }
  writeFileSync(resolve(root, `${docs}inventory.json`), JSON.stringify(result, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify(result.counts, null, 2))
}

function main() {
  const state = JSON.parse(readFileSync(resolve(root, `${docs}state.json`), 'utf8'))
  const command = process.argv[2] ?? 'status'
  if (!['status', 'check', 'inventory'].includes(command)) throw new Error('Uso: node launcher/scripts/react-migration.mjs status|check|inventory')
  const errors = [...validateState(state, root), ...checkRepository(state)]
  if (errors.length) {
    console.error(errors.map(error => `FAIL: ${error}`).join('\n'))
    process.exitCode = 1
    return
  }
  if (command === 'inventory') return inventory(state)
  if (command === 'check') {
    console.log('OK: integridad de plan/alcance, orden de etapas, evidencias y archivos protegidos. No certifica corrección funcional ni aceptación visual.')
    return
  }
  const stage = state.stages[state.currentStage]
  console.log(`Plan: ${state.plan.path}\nAlcance: ${state.scope.path}\nReferencia: ${state.baseline.version} (${state.baseline.commit})`)
  console.log(`Etapa ${stage.id}: ${stage.title} [${stage.status}]`)
  stage.gates.forEach(gate => console.log(`  ${gate.status}: ${gate.id}`))
  console.log(`Siguiente: ${state.nextAction}`)
  console.log('Leer RESUME.md y PARITY.md. No ejecutar el instalador en el perfil habitual ni reintroducir extras de XMCL.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
