import { ExploreProjectModern } from '@/components/StoreExploreCardModern.vue'
import { CurseforgeBuiltinClassId, useCurseforge } from '@/composables/curseforge'
import { useDateString } from '@/composables/date'
import { useMarketSort } from '@/composables/marketSort'
import { useModrinth } from '@/composables/modrinth'
import { useService } from '@/composables/service'
import { getCursforgeModLoadersFromString } from '@/util/curseforge'
import { getExpectedSize } from '@/util/size'
import { getStoreSources, mergeStoreResults, StoreSortMetrics } from '@/util/storeSort'
import { ProjectMappingServiceKey } from '@xmcl/runtime-api'
import { Ref, computed, ref, watch } from 'vue'

interface UseSearchedItemsOptions {
  query: Ref<string>
  gameVersion: Ref<string>
  modLoaders: Ref<string[]>
  sort: Ref<string>
  page: Ref<number>
  omitSources: Ref<string[]>
  modrinthCategories: Ref<string[]>
  curseforgeCategory: Ref<number | undefined>
  pageSize: number
  tCategory: (key: string) => string
}

export function useSearchedItems(options: UseSearchedItemsOptions) {
  const {
    query,
    gameVersion,
    modLoaders,
    sort,
    page,
    omitSources,
    modrinthCategories,
    curseforgeCategory,
    pageSize,
    tCategory,
  } = options

  const { getDateString } = useDateString()
  const { lookupBatch } = useService(ProjectMappingServiceKey)
  const { modrinthSort, curseforgeSort } = useMarketSort(sort)
  const sources = computed(() => getStoreSources(omitSources.value, modrinthCategories.value, curseforgeCategory.value).filter(source => source !== 'ftb'))
  type StoreProject = ExploreProjectModern & { sortMetrics: StoreSortMetrics }

  // Modrinth
  const {
    error: searchError,
    refreshing: isModrinthSearching,
    projects,
    pageCount: modrinthPageCount,
    refresh: refreshModrinth,
  } = useModrinth(
    query,
    gameVersion,
    '',
    modrinthCategories,
    modLoaders,
    '',
    modrinthSort,
    'modpack',
    page,
    pageSize,
    computed(() => sources.value.includes('modrinth')),
  )

  // Curseforge
  const { projects: curseforgeProjects, pages: curseforgePageCount, isValidating: isCurseforgeSearching, error: curseforgeError, mutate: refreshCurseforge } = useCurseforge(
    CurseforgeBuiltinClassId.modpack,
    query,
    page,
    computed(() => getCursforgeModLoadersFromString(modLoaders.value)),
    curseforgeCategory,
    curseforgeSort,
    gameVersion,
    pageSize,
    computed(() => sources.value.includes('curseforge')),
  )

  // Mappings for search results
  const mappings = ref<Record<string, { name: string; description: string }>>({})

  watch([projects, curseforgeProjects], async ([modrinthProjects, cfProjects]) => {
    const modrinthIds = modrinthProjects.map(p => p.project_id)
    const curseforgeIds = cfProjects.map(p => p.id)

    const result = await lookupBatch(modrinthIds, curseforgeIds)
    const newMappings: Record<string, { name: string; description: string }> = {}

    for (const mapping of result) {
      if (mapping.modrinthId) {
        newMappings[`modrinth:${mapping.modrinthId}`] = {
          name: mapping.name,
          description: mapping.description,
        }
      }
      if (mapping.curseforgeId) {
        newMappings[`curseforge:${mapping.curseforgeId}`] = {
          name: mapping.name,
          description: mapping.description,
        }
      }
    }

    mappings.value = newMappings
  }, { immediate: true })

  const items = computed(() => {
    const modrinths = projects.value.map((p) => {
      const mapping = mappings.value[`modrinth:${p.project_id}`]
      const mapped: StoreProject = {
        sortMetrics: {
          downloads: p.downloads,
          updated: Date.parse(p.date_modified),
          newest: Date.parse(p.date_created),
        },
        id: p.project_id,
        type: 'modrinth',
        title: p.title,
        iconUrl: p.icon_url,
        description: p.description,
        author: p.author,
        downloadCount: getExpectedSize(p.downloads, ''),
        updatedAt: getDateString(p.date_modified),
        version: p.versions[p.versions.length - 1],
        gallery: p.gallery,
        localizedTitle: mapping?.name,
        localizedDescription: mapping?.description,
      }
      return mapped
    })
    const curseforges = curseforgeProjects.value.map((p) => {
      const mapping = mappings.value[`curseforge:${p.id}`]
      const mapped: StoreProject = {
        sortMetrics: {
          downloads: p.downloadCount,
          updated: Date.parse(p.dateModified),
          newest: Date.parse(p.dateCreated),
        },
        id: p.id.toString(),
        type: 'curseforge',
        title: p.name,
        iconUrl: p.logo?.thumbnailUrl ?? '',
        description: p.summary,
        author: p.authors[0]?.name ?? '',
        downloadCount: getExpectedSize(p.downloadCount, ''),
        updatedAt: getDateString(p.dateModified),
        version: p.latestFilesIndexes[0]?.gameVersion,
        gallery: p.screenshots.map(s => s?.thumbnailUrl || ''),
        localizedTitle: mapping?.name,
        localizedDescription: mapping?.description,
      }
      return mapped
    })

    const results = { modrinth: modrinths, curseforge: curseforges }
    // A single provider's server-side ordering must survive unchanged across pages.
    if (sources.value.length === 1) return results[sources.value[0]]
    return mergeStoreResults(sources.value.map(source => results[source]), modrinthSort.value)
  })

  const pageCount = computed(() => Math.max(0, ...sources.value.map(source => {
    if (source === 'modrinth') return modrinthPageCount.value
    if (source === 'curseforge') return curseforgePageCount.value
    return 0
  })))
  const isSearching = computed(() => sources.value.some(source => source === 'modrinth' ? isModrinthSearching.value : isCurseforgeSearching.value))
  const sourceErrors = computed(() => sources.value.filter(source => source === 'modrinth' ? searchError.value : curseforgeError.value))
  const retrySource = (source: 'modrinth' | 'curseforge') => {
    if (!sources.value.includes(source)) return
    return source === 'modrinth' ? refreshModrinth() : refreshCurseforge()
  }

  return {
    items,
    isSearching,
    searchError,
    pageCount,
    sources,
    sourceErrors,
    retrySource,
  }
}
