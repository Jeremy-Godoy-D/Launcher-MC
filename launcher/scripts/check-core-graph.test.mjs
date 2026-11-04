import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditCoreGraph } from './check-core-graph.mjs'

const ui = { modules: [{ id: '/node_modules/react-dom/client.js', bytes: 100 }] }
const graph = inputs => [{ name: 'main', data: { outputs: { 'index.js': { inputs: { '../xmcl-runtime/app/BaseService.ts': { bytesInOutput: 10 }, ...inputs } } } } }]
test('checks emitted bytes and permits inert compatibility keys', () => {
  assert.equal(auditCoreGraph(graph({ '../xmcl-runtime/agent/AgentService.ts': { bytesInOutput: 0 }, '../xmcl-runtime-api/src/services/AgentService.ts': { bytesInOutput: 100 } }), ui).passed, true)
  assert.equal(auditCoreGraph(graph({ '../xmcl-runtime/agent/AgentService.ts': { bytesInOutput: 1 } }), ui).passed, false)
  assert.equal(auditCoreGraph(graph({ '/node_modules/ssh2/lib/client.js': { bytesInOutput: 1 } }), ui).passed, false)
  assert.equal(auditCoreGraph(graph({}), { modules: [...ui.modules, { id: '/node_modules/@vue/runtime-core/index.js', bytes: 5 }] }).passed, false)
})
test('does not accept empty or incomplete metadata as evidence', () => {
  assert.throws(() => auditCoreGraph([], ui), /Complete/)
  assert.throws(() => auditCoreGraph(graph({}), { modules: [] }), /Complete/)
})
