import BaseSetting from '@/views/BaseSetting.vue'
import BaseSettingActions from '@/views/BaseSettingActions.vue'
import BaseSettingExtension from '@/views/BaseSettingExtension.vue'
import Home from '@/views/Home.vue'
import LaunchCenter from '@/views/LaunchCenter.vue'
import HomeActions from '@/views/HomeActions.vue'
import HomeExtension from '@/views/HomeExtension.vue'
import HomeLayout from '@/views/HomeLayout.vue'
import LauncherLibrary from '@/views/LauncherLibrary.vue'
import LauncherAccounts from '@/views/LauncherAccounts.vue'
import Mod from '@/views/Mod.vue'
import ModActions from '@/views/ModActions.vue'
import ModExtension from '@/views/ModExtension.vue'
import ResourcePack from '@/views/ResourcePack.vue'
import ResourcePackActions from '@/views/ResourcePackActions.vue'
import ResourcePackExtension from '@/views/ResourcePackExtension.vue'
import Save from '@/views/Save.vue'
import SaveActions from '@/views/SaveActions.vue'
import SaveExtension from '@/views/SaveExtension.vue'
import Setting from '@/views/Setting.vue'
import ShaderPack from '@/views/ShaderPack.vue'
import ShaderPackActions from '@/views/ShaderPackActions.vue'
import ShaderPackExtension from '@/views/ShaderPackExtension.vue'
import Store from '@/views/Store.vue'
import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: HomeLayout,
      children: [
        { path: '', component: LaunchCenter },
        {
          path: 'instance',
          components: {
            default: Home,
            extensions: HomeExtension,
            actions: HomeActions,
          },
        },
        {
          path: 'instance/save',
          components: {
            default: Save,
            extensions: SaveExtension,
            actions: SaveActions,
          },
        },
        {
          path: 'instance/mods',
          components: {
            default: Mod,
            extensions: ModExtension,
            actions: ModActions,
          },
        },
        {
          path: 'instance/resourcepacks',
          components: {
            default: ResourcePack,
            extensions: ResourcePackExtension,
            actions: ResourcePackActions,
          },
        },
        {
          path: 'instance/shaderpacks',
          components: {
            default: ShaderPack,
            extensions: ShaderPackExtension,
            actions: ShaderPackActions,
          },
        },
        {
          path: 'instance/blueprints',
          meta: { blueprintState: true },
          components: {
            default: () => import('@/views/Blueprint.vue'),
            extensions: () => import('@/views/BlueprintExtension.vue'),
            actions: () => import('@/views/BlueprintActions.vue'),
          },
        },
        {
          path: 'instance/base-setting',
          components: {
            default: BaseSetting,
            extensions: BaseSettingExtension,
            actions: BaseSettingActions,
          },
        },
        {
          path: 'base-setting/modrinth-project',
          redirect: { path: '/base-setting', query: { target: 'modrinth-project' } },
        },
      ],
    },
    {
      path: '/store',
      component: Store,
      children: [
        {
          path: '',
          component: { render: () => null },
        },
        {
          path: 'modrinth/:id',
          component: () => import('@/views/StoreProjectModrinth.vue'),
          props: (route) => ({ id: route.params.id }),
        },
        {
          path: 'curseforge/:id',
          component: () => import('@/views/StoreProjectCurseforge.vue'),
          props: (route) => ({ id: Number(route.params.id) }),
        },
        {
          path: 'ftb/:id',
          component: () => import('@/views/StoreProjectFeedTheBeast.vue'),
          props: (route) => ({ id: Number(route.params.id) }),
        },
      ],
    },
    {
      path: '/setting',
      component: Setting,
    },
    {
      path: '/me',
      component: LauncherLibrary,
      meta: { workspaceSidePanel: true },
    },
    {
      path: '/accounts',
      component: LauncherAccounts,
    },
  ],
})


router.beforeEach((to) => {
  const legacy = ['/mods', '/resourcepacks', '/shaderpacks', '/save', '/base-setting']
  if (legacy.includes(to.path)) return { path: '/instance' + to.path, query: to.query, hash: to.hash, replace: true }
  if (to.path === '/multiplayer' || (to.path.startsWith('/blueprints') || to.path.startsWith('/instance/blueprints')) || to.path.startsWith('/store/ftb/')) return '/me'
})
