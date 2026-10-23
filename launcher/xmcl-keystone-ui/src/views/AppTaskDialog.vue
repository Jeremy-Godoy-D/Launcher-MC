<template>
  <v-dialog
    v-model="isShown"
    :scrim="false"
    :retain-focus="false"
    width="700"
    style="max-height: 100%"
    class="task-dialog aurora-task-island"
  >
    <TaskView />
  </v-dialog>
</template>

<script lang=ts setup>
import { useDialog } from '../composables/dialog'
import TaskView from './AppTaskDialogTaskView.vue'
import { onScopeDispose } from 'vue'

const { hide, isShown } = useDialog('task', () => {
  windowController.focus()
})
const router = useRouter()
const removeAfterEach = router.afterEach(() => {
  if (isShown.value) {
    hide()
  }
})
onScopeDispose(removeAfterEach)
</script>

<style scoped=true>
.v-progress-linear {
  margin-left: 10px;
}
</style>
<style>
.v-treeview-node__label {
  white-space: normal;
  line-break: normal;
  word-break: break-all;
}
.task-dialog .v-treeview > .v-treeview-node--leaf {
  margin-left: 0px;
}
.aurora-task-island .v-overlay__content {
  position: absolute;
  top: 56px;
  right: 20px;
  margin: 0 !important;
  max-width: calc(100vw - 40px) !important;
  max-height: calc(100vh - 140px) !important;
  overflow: auto;
  border: 1px solid var(--mc-rule-strong);
  border-radius: 20px;
  background: var(--ag-glass, var(--mc-surface));
}
</style>
