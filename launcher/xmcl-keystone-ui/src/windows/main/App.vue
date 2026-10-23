<template>
  <v-app v-if="!showSetup" class="aurora-shell h-full max-h-screen overflow-hidden select-none" :class="{ 'dark': isDark, 'ag-perf': performanceMode }">
    <AppBackground />
    <div v-if="!isBigPicture" class="w-full h-full absolute left-0 header-overlay" :style="{
      height: headerHeight + 70 + 'px',
      'background-image': `linear-gradient(${appBarColor} 0%, color-mix(in srgb, ${appBarColor}, transparent) 65%, transparent 100%)`
    }">
    </div>
    <AppSystemBar v-if="!isBigPicture" back>
      <span class="inline-flex items-center gap-2 px-2 text-xs font-semibold tracking-tight text-[var(--mc-ink-secondary)]">
        <span>Launcher MC</span><span class="opacity-40">/</span><span>{{ sectionLabel }}</span>
      </span>
    </AppSystemBar>
    <div
      class="app-layout flex-grow relative flex overflow-auto"
      :class="[layoutClasses, { 'workspace-side-panel-attached': hasAttachedWorkspacePanel }]"
    >
      <main class="aurora-stage relative flex max-h-full flex-1 flex-col overflow-auto" :class="mainClasses">
        <router-view v-slot="{ Component }">
          <transition name="aurora-scene" mode="out-in">
            <component :is="Component" class="z-2" />
          </transition>
        </router-view>
      </main>
      <AppDock v-if="!isBigPicture" />
    </div>
    <AppContextMenu />
    <AppNotifier />
    <AppOmniDialog :agent-enabled="false" />
    <AppAddInstanceDialog />
    <AppGameExitDialog />
    <AppUnauthenticatedWarningDialog />
    <AppImageDialog />
    <AppSharedTooltip />
    <UserProfileDialog :value="userProfileDialogShown" @input="userProfileDialogShown = $event" />
    <component :is="lazyDialogComponent" v-if="lazyDialogComponent" />
    <AppSideBarGroupSettingDialog :default-color="defaultColor" />
    <AppGamepadPrompt />
    <transition name="bp-mode">
      <AppBigPictureView v-if="isBigPicture" />
    </transition>
  </v-app>
  <v-app v-else class="aurora-shell h-full max-h-screen overflow-hidden" :class="{ 'dark': isDark }">
    <AppBackground />
    <AppSystemBar no-user no-task no-debug><span class="px-4">Launcher MC</span></AppSystemBar>
    <div class="app-layout relative flex min-h-0 flex-1 overflow-hidden">
      <Setup @ready="onReady" />
    </div>
    <UserProfileDialog :value="userProfileDialogShown" @input="userProfileDialogShown = $event" />
    <component :is="lazyDialogComponent" v-if="lazyDialogComponent" />
    <AppGamepadPrompt />
  </v-app>
</template>

<script lang=ts setup>
import '@/assets/common.css'
import '@/assets/aurora.css'
import { useAuroraPreferences } from '@/composables/aurora'
import AppImageDialog from '@/components/AppImageDialog.vue'
import AppSharedTooltip from '@/components/AppSharedTooltip.vue'
import { useAuthProfileImportNotification } from '@/composables/authProfileImport'
import { kAgent, useAgent } from '@/composables/agent'
import { useCommandPaletteHotkey } from '@/composables/commandPalette'
import { kDialogModel } from '@/composables/dialog'
import { useDefaultErrorHandler } from '@/composables/errorHandler'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstance } from '@/composables/instance'
import { kInstanceLaunchCoordinator, useInstanceLaunchCoordinator } from '@/composables/instanceLaunchCoordinator'
import { kLaunchButton, useLaunchButton } from '@/composables/launchButton'
import { kLocalizedContent, useLocalizedContentControl } from '@/composables/localizedContent'
import { useNotifier } from '@/composables/notifier'
import { kCompact } from '@/composables/scrollTop'
import { kSettingsState } from '@/composables/setting'
import { kTheme } from '@/composables/theme'
import { kTutorial } from '@/composables/tutorial'
import { kInFocusMode } from '@/composables/uiLayout'
import { kSidebarSettings, useInjectSidebarSettings, useSidebarSettings } from '@/composables/sidebarSettings'
import { basename } from '@/util/basename'
import { injection } from '@/util/inject'
import AppAddInstanceDialog from '@/views/AppAddInstanceDialog.vue'
import AppBackground from '@/views/AppBackground.vue'
import AppOmniDialog from '@/views/AppOmniDialog.vue'
import AppContextMenu from '@/views/AppContextMenu.vue'
import AppGameExitDialog from '@/views/AppGameExitDialog.vue'
import AppUnauthenticatedWarningDialog from '@/views/AppUnauthenticatedWarningDialog.vue'
import UserProfileDialog from '@/components/UserProfileDialog.vue'
import AppNotifier from '@/views/AppNotifier.vue'
import AppDock from '@/views/AppDock.vue'
import AppSystemBar from '@/views/AppSystemBar.vue'
import Setup from '@/views/Setup.vue'
import { useLocalStorage, useMediaQuery, usePreferredColorScheme, usePreferredDark } from '@vueuse/core'
import { kInstanceLauncher, useInstanceLauncher } from '@/composables/instanceLauncher'
import { kMinecraftFriends, useMinecraftFriendsImpl } from '@/composables/minecraftFriends'
import { useUserMenuControl } from '@/composables/userMenu'
import { UserSkinRenderPaused } from '@/composables/userSkin'
import AppSideBarGroupSettingDialog from '@/views/AppSideBarGroupSettingDialog.vue'
import AppGamepadPrompt from '@/views/AppGamepadPrompt.vue'
import AppBigPictureView from '@/views/AppBigPictureView.vue'
import { kBigPicture, useBigPicture } from '@/composables/bigPicture'
import { useInstanceGroupDefaultColor } from '@/composables/instanceGroup'
import { kMultiplayerEntry, useMultiplayerEntry } from '@/composables/multiplayerEntry'

const lazyDialogComponents = {
  'task': defineAsyncComponent(() => import('@/views/AppTaskDialog.vue')),
  'feedback': defineAsyncComponent(() => import('@/views/AppFeedbackDialog.vue')),
  'share-instance': defineAsyncComponent(() => import('@/views/AppShareInstanceDialog.vue')),
  'delete-instance': defineAsyncComponent(() => import('@/views/AppInstanceDeleteDialog.vue')),
  'launch-blocked': defineAsyncComponent(() => import('@/views/AppLaunchBlockedDialog.vue')),
  'InstanceInstallSkipDialog': defineAsyncComponent(() => import('@/views/AppInstallSkipDialog.vue')),
  'modpack-update-or-create': defineAsyncComponent(() => import('@/views/AppModpackUpdateDialog.vue')),
  'instance-server-edit': defineAsyncComponent(() => import('@/views/AppJoinServerDialog.vue')),
  'migrate-wizard': defineAsyncComponent(() => import('@/views/AppMigrateWizardDialog.vue')),
  'minecraft-friends': defineAsyncComponent(() => import('@/views/AppMinecraftFriendsDialog.vue')),
  'mod-group-select': defineAsyncComponent(() => import('@/views/ModGroupSelectDialog.vue')),
  'modrinth-login': defineAsyncComponent(() => import('@/views/AppModrinthLoginDialog.vue')),
  'modrinth-project-create': defineAsyncComponent(() => import('@/views/AppModrinthProjectCreateDialog.vue')),
  'modrinth-project-bind': defineAsyncComponent(() => import('@/views/AppModrinthProjectBindDialog.vue')),
  'modrinth-version-publish': defineAsyncComponent(() => import('@/views/AppModrinthVersionPublishDialog.vue')),
}

const showSetup = ref(location.search.indexOf('bootstrap') !== -1)
const { performanceMode } = useAuroraPreferences()
const { state } = injection(kSettingsState)
const dialogModel = injection(kDialogModel)
const lazyDialogComponent = computed(() => lazyDialogComponents[dialogModel.current.value.dialog as keyof typeof lazyDialogComponents])


const bigPicture = useBigPicture()
provide(kBigPicture, bigPicture)
const { isBigPicture } = bigPicture

provide('streamerMode', useLocalStorage('streamerMode', false, { writeDefaults: false }))
provide(kLocalizedContent, useLocalizedContentControl())
provide(kInstanceLauncher, useInstanceLauncher())
provide(kMinecraftFriends, useMinecraftFriendsImpl(undefined, false))

// Agent must run in App.vue (not Context.ts) because its tool factory
// injects kInstance/kInstanceMods/... which are provided by Context itself,
// and `inject` only resolves on descendants.
const agent = useAgent()
provide(kAgent, agent)

// User profile dialog — moved from AppSystemBarUserMenu to App root
const userMenu = useUserMenuControl()
const userProfileDialogShown = userMenu.shown
const route = useRoute()
const sectionLabel = computed(() => route.path.startsWith('/store') ? 'Catálogo' : route.path === '/me' ? 'Biblioteca' : route.path === '/setting' ? 'Ajustes' : route.path === '/accounts' ? 'Cuentas' : route.path.startsWith('/instance') ? 'Tu instancia' : 'Inicio')
const hasAttachedWorkspacePanel = computed(
  () => route.meta.workspaceSidePanel === true && sidebarPosition.value === 'left',
)
provide(UserSkinRenderPaused, computed(() => !userProfileDialogShown.value && route.path !== '/me'))

// Bind Ctrl/Cmd+Shift+C to open the command palette.
useCommandPaletteHotkey()

const defaultColor = useInstanceGroupDefaultColor()

const modes = useLocalStorage('instanceEnabledDashboard', {} as Record<string, boolean>)
const { path } = injection(kInstance)
const isLessThan490px = useMediaQuery('(max-height: 570px)')
provide(kInFocusMode, computed({
  get() {
    const less = isLessThan490px.value
    const isDashboard = modes.value[basename(path.value)]
    if (isDashboard === undefined) {
      return true // 'focus' is default
    }
    if (less) {
      return false
    }
    return !isDashboard
  },
  set(inFocus) {
    const isDashboard = !inFocus
    modes.value = { ...modes.value, [basename(path.value)]: isDashboard }
  },
}))

provide(kLaunchButton, useLaunchButton())
provide(kInstanceLaunchCoordinator, useInstanceLaunchCoordinator())
provide(kMultiplayerEntry, useMultiplayerEntry())

const sidebarSettings = useSidebarSettings()
provide(kSidebarSettings, sidebarSettings)
const sidebarPosition = computed(() => sidebarSettings.position.value)
const sidebarStyle = computed(() => sidebarSettings.style.value)

const layoutClasses = computed(() => ({
  'flex-row': sidebarPosition.value === 'left' || sidebarPosition.value === 'right',
  'flex-col': sidebarPosition.value === 'top' || sidebarPosition.value === 'bottom',
  'flex-row-reverse': sidebarPosition.value === 'right',
  'flex-col-reverse': sidebarPosition.value === 'bottom',
}))

const mainClasses = computed(() => ({
  'inset-y-0': sidebarPosition.value === 'left' || sidebarPosition.value === 'right',
  'inset-x-0': sidebarPosition.value === 'top' || sidebarPosition.value === 'bottom',
}))

const compact = ref(false)
provide(kCompact, compact)

const headerHeight = ref(0)
provide('headerHeight', headerHeight)

const { appBarColor, dark } = injection(kTheme)

watch(dark, (newVal) => {
  state.value?.themeSet(newVal === 'system' ? newVal : newVal ? 'dark' : 'light')
}, { immediate: true })

const tutor = injection(kTutorial)
const { show: showCreateInstance } = useDialog(AddInstanceDialogKey)
const router = useRouter()
// Set theme and start tutorial
const onReady = async (data: any) => {
  await nextTick()
  showSetup.value = false
  await nextTick()
  if (state.value) {
    state.value.themeSet(data.theme)
  } else {
    const unwatch = watch(state, (state) => {
      if (state) {
        state.themeSet(data.theme)
      }
      unwatch()
    })
  }
  await router.push(data.firstAction === 'store' ? '/store' : '/')
  if (data.firstAction === 'create') showCreateInstance()
}

// color theme sync
const { isDark } = injection(kTheme)

// Notifier
const { notify } = useNotifier()
useDefaultErrorHandler(notify)
useAuthProfileImportNotification(notify)
</script>

<style scoped>

.clip-head {
  clip-path: inset(0px 30px 30px 0px) !important;
  width: 64px;
  height: auto;
  /*to preserve the aspect ratio of the image*/
}

.v-input__icon--prepend {
  margin-right: 7px;
}

img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.workspace-side-panel-attached :deep(.sidebar) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.workspace-side-panel-attached :deep(.sidebar-notch--left .sidebar-notch__container) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
</style>
