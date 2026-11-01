import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Award,
  CheckCircle,
  Circle,
  FolderTree,
  List,
  RefreshCw,
  Search,
  Trophy,
} from 'lucide-react'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import type {
  InstanceProgressAdvancement,
  InstanceSaveProgress,
} from '@xmcl/runtime-api/src/entities/save'
import { useService } from '../../runtime'
import { useI18n } from '../../i18n'

export function WorldProgress({
  savePath,
  instancePath,
  running,
}: {
  savePath: string
  instancePath?: string
  running: boolean
}) {
  const service = useService(InstanceSavesServiceKey)
  const { t, n, locale } = useI18n()
  const [progress, setProgress] = useState<InstanceSaveProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<'advancements' | 'quests' | 'stats'>('advancements')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [selectedChapterId, setSelectedChapterId] = useState<string>('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(false)
      setProgress(null)
      try {
        const res = await service.getInstanceSaveProgress({ savePath, instancePath, locale })
        if (active) {
          setProgress(res)
          setSelectedChapterId(current => res.quests?.chapters.some(chapter => chapter.id === current) ? current : res.quests?.chapters[0]?.id || '')
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [service, savePath, instancePath, revision, locale])

  const advancements = progress?.advancements?.items ?? []
  const hasAdvancements = advancements.length > 0
  const hasQuests = (progress?.quests?.chapters?.length ?? 0) > 0
  const hasStats = !!progress?.stats

  const advDone = progress?.advancements?.completed ?? 0
  const advTotal = advancements.length
  const advPercent = advTotal > 0 ? Math.round((advDone / advTotal) * 100) : 0

  const filteredAdvancements = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return advancements
    return advancements.filter(
      (a) =>
        (a.title || a.id).toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.mod || '').toLowerCase().includes(q),
    )
  }, [advancements, query])

  const currentChapter = useMemo(() => {
    if (!progress?.quests?.chapters?.length) return null
    return (
      progress.quests.chapters.find((c) => c.id === selectedChapterId) ||
      progress.quests.chapters[0]
    )
  }, [progress?.quests?.chapters, selectedChapterId])

  const filteredQuests = useMemo(() => {
    const list = currentChapter?.quests ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (quest) =>
        quest.title.toLowerCase().includes(q) ||
        (quest.subtitle || '').toLowerCase().includes(q) ||
        (quest.description || '').toLowerCase().includes(q),
    )
  }, [currentChapter, query])

  return (
    <section className="world-progress" data-testid="world-progress" aria-label={t('react.worldProgress.tab')} aria-busy={loading}>
      <div className="section-heading">
        <div className="content-selection">
          <button
            type="button"
            className={`button ${tab === 'advancements' ? 'primary' : 'secondary'}`}
            data-testid="progress-advancements"
            onClick={() => setTab('advancements')}
          >
            <Trophy size={16} aria-hidden="true" />
            {t('react.worldProgress.advancements')}
            {hasAdvancements && (
              <span className="badge font-mono ml-2">
                {advDone}/{advTotal} ({advPercent}%)
              </span>
            )}
          </button>
          {hasQuests && (
            <button
              type="button"
              className={`button ${tab === 'quests' ? 'primary' : 'secondary'}`}
              data-testid="progress-quests"
              onClick={() => setTab('quests')}
            >
              <Award size={16} aria-hidden="true" />
              {t('react.worldProgress.quests')}
              <span className="badge font-mono ml-2">
                {progress?.quests?.completedQuests}/{progress?.quests?.totalQuests}
              </span>
            </button>
          )}
          {hasStats && (
            <button
              type="button"
              className={`button ${tab === 'stats' ? 'primary' : 'secondary'}`}
              data-testid="progress-stats"
              onClick={() => setTab('stats')}
            >
              <Activity size={16} aria-hidden="true" />
              {t('react.worldProgress.stats')}
            </button>
          )}
        </div>
        <div className="content-actions">
          <button
            type="button"
            className="button secondary"
            disabled={loading || running}
            data-testid="progress-refresh"
            aria-label={t('react.worlds.refresh')}
            onClick={() => { setLoading(true); setError(false); setProgress(null); setRevision((v) => v + 1) }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {error && t('react.worlds.refresh')}
          </button>
        </div>
      </div>

      {loading && <p role="status">{t('react.worldProgress.loading')}</p>}
      {error && (
        <p className="form-error" role="alert">
          {t('react.worldProgress.loadFailed')}
        </p>
      )}

      {!loading && !error && !hasAdvancements && !hasQuests && !hasStats && (
        <p className="empty">{t('react.worldProgress.empty')}</p>
      )}

      {!loading && !error && (
        <>
          {tab !== 'stats' && (
            <div className="content-filters" style={{ margin: '12px 0' }}>
              <label className="search" style={{ flex: 1 }}>
                <Search size={16} aria-hidden="true" />
                <input
                  data-testid="progress-filter"
                  aria-label={t('react.worldProgress.filter')}
                  placeholder={t('react.worldProgress.filter')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {tab === 'advancements' && (
                <div className="content-actions">
                  <button
                    type="button"
                    className={`button ${viewMode === 'list' ? 'primary' : 'secondary'}`}
                    data-testid="progress-view-mode"
                    aria-label={t(viewMode === 'list' ? 'react.worldProgress.viewTree' : 'react.worldProgress.viewList')}
                    onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
                  >
                    {viewMode === 'list' ? <List size={16} /> : <FolderTree size={16} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'advancements' && hasAdvancements && (
            <div className="advancements-content" data-testid="progress-advancements-container">
              {viewMode === 'list' ? (
                <ul className="pack-list" data-testid="progress-list">
                  {filteredAdvancements.map((adv) => (
                    <AdvancementRow key={adv.id} item={adv} t={t} />
                  ))}
                </ul>
              ) : (
                <AdvancementTree items={filteredAdvancements} t={t} />
              )}
            </div>
          )}

          {tab === 'quests' && hasQuests && progress?.quests && (
            <div className="quests-content" data-testid="progress-quests-container">
              {progress.quests.chapters.length > 1 && (
                <div className="content-selection" style={{ marginBottom: 12 }}>
                  {progress.quests.chapters.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      className={`button ${selectedChapterId === ch.id ? 'primary' : 'secondary'}`}
                      onClick={() => setSelectedChapterId(ch.id)}
                    >
                      {ch.iconDataUrl ? (
                        <img src={ch.iconDataUrl} alt="" className="w-4 h-4 object-contain inline mr-1" />
                      ) : (
                        <Award size={14} className="inline mr-1" />
                      )}
                      {ch.title}
                      <span className="badge font-mono ml-2">
                        {ch.completedQuests}/{ch.totalQuests}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <ul className="pack-list">
                {filteredQuests.map((q) => (
                  <li key={q.id}>
                    <div className="world-icon">
                      {q.iconDataUrl ? (
                        <img src={q.iconDataUrl} alt="" loading="lazy" />
                      ) : (
                        <Award size={22} aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <strong>{q.title}</strong>
                      {q.subtitle && <small className="block text-muted">{q.subtitle}</small>}
                      {q.description && <p className="content-description">{q.description}</p>}
                    </div>
                    <div>
                      <span
                        className={`badge ${q.done ? 'badge-success' : 'badge-muted'}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {q.done ? <CheckCircle size={14} /> : <Circle size={14} />}
                        {q.done ? t('react.worldProgress.completed') : t(q.locked ? 'react.worldProgress.locked' : 'react.worldProgress.incomplete')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'stats' && hasStats && progress?.stats && (
            <div className="stats-content" data-testid="progress-stats-container">
              <dl className="content-metadata" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="stat-card p-3 rounded bg-surface border">
                  <dt className="text-muted text-xs">{t('react.worldProgress.playTime')}</dt>
                  <dd className="text-xl font-bold font-mono">
                    {n(Math.floor(progress.stats.playTimeTicks / (20 * 60)))} min
                  </dd>
                </div>
                <div className="stat-card p-3 rounded bg-surface border">
                  <dt className="text-muted text-xs">{t('react.worldProgress.deaths')}</dt>
                  <dd className="text-xl font-bold font-mono">{n(progress.stats.deaths)}</dd>
                </div>
                <div className="stat-card p-3 rounded bg-surface border">
                  <dt className="text-muted text-xs">{t('react.worldProgress.mobKills')}</dt>
                  <dd className="text-xl font-bold font-mono">{n(progress.stats.mobKills)}</dd>
                </div>
                {progress.stats.minedBlocksTotal !== undefined && (
                  <div className="stat-card p-3 rounded bg-surface border">
                    <dt className="text-muted text-xs">{t('react.worldProgress.minedBlocks')}</dt>
                    <dd className="text-xl font-bold font-mono">{n(progress.stats.minedBlocksTotal)}</dd>
                  </div>
                )}
                {progress.stats.damageDealt !== undefined && (
                  <div className="stat-card p-3 rounded bg-surface border">
                    <dt className="text-muted text-xs">{t('react.worldProgress.damageDealt')}</dt>
                    <dd className="text-xl font-bold font-mono">{n(Math.round(progress.stats.damageDealt))}</dd>
                  </div>
                )}
                {progress.stats.damageTaken !== undefined && (
                  <div className="stat-card p-3 rounded bg-surface border">
                    <dt className="text-muted text-xs">{t('react.worldProgress.damageTaken')}</dt>
                    <dd className="text-xl font-bold font-mono">{n(Math.round(progress.stats.damageTaken))}</dd>
                  </div>
                )}
                {progress.stats.jump !== undefined && (
                  <div className="stat-card p-3 rounded bg-surface border">
                    <dt className="text-muted text-xs">{t('react.worldProgress.jumps')}</dt>
                    <dd className="text-xl font-bold font-mono">{n(progress.stats.jump)}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function AdvancementRow({ item, t }: { item: InstanceProgressAdvancement; t: (key: string) => string }) {
  return (
    <li data-advancement-id={item.id}>
      <div className="world-icon">
        {item.iconDataUrl ? (
          <img src={item.iconDataUrl} alt="" loading="lazy" />
        ) : (
          <Award size={22} aria-hidden="true" />
        )}
      </div>
      <div className="content-file">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <strong>{item.title || item.id}</strong>
          {item.frame && <span className="badge text-xs">{t(`react.worldProgress.frame.${item.frame}`)}</span>}
          {item.mod && <small className="text-muted">{item.mod}</small>}
        </div>
        {item.description && <p className="content-description">{item.description}</p>}
        {item.totalCriteria > 1 && (
          <small className="text-muted">
            {item.criteriaCompleted} / {item.totalCriteria}
          </small>
        )}
      </div>
      <div>
        <span
          className={`badge ${item.done ? 'badge-success' : 'badge-muted'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {item.done ? <CheckCircle size={14} /> : <Circle size={14} />}
          {item.done ? t('react.worldProgress.completed') : t('react.worldProgress.incomplete')}
        </span>
      </div>
    </li>
  )
}

function AdvancementTree({
  items,
  t,
}: {
  items: InstanceProgressAdvancement[]
  t: (key: string) => string
}) {
  // Group by root or parent
  const roots = useMemo(() => items.filter((i) => !i.parent), [items])
  const childrenMap = useMemo(() => {
    const map = new Map<string, InstanceProgressAdvancement[]>()
    for (const item of items) {
      if (item.parent) {
        const list = map.get(item.parent) || []
        list.push(item)
        map.set(item.parent, list)
      }
    }
    return map
  }, [items])

  return (
    <div className="advancement-tree" data-testid="progress-tree" style={{ padding: '8px 0' }}>
      {roots.map((root) => (
        <TreeNode key={root.id} node={root} childrenMap={childrenMap} level={0} t={t} />
      ))}
    </div>
  )
}

function TreeNode({
  node,
  childrenMap,
  level,
  t,
}: {
  node: InstanceProgressAdvancement
  childrenMap: Map<string, InstanceProgressAdvancement[]>
  level: number
  t: (key: string) => string
}) {
  const children = childrenMap.get(node.id) || []
  return (
    <div style={{ marginLeft: level * 24, marginTop: 8, borderLeft: level > 0 ? '2px solid var(--line)' : undefined, paddingLeft: level > 0 ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {node.iconDataUrl ? (
          <img src={node.iconDataUrl} alt="" className="w-5 h-5 object-contain" />
        ) : (
          <Award size={18} />
        )}
        <strong>{node.title || node.id}</strong>
        <span
          className={`badge ${node.done ? 'badge-success' : 'badge-muted'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem' }}
        >
          {node.done ? <CheckCircle size={12} /> : <Circle size={12} />}
          {node.done ? t('react.worldProgress.completed') : t('react.worldProgress.incomplete')}
        </span>
      </div>
      {children.map((child) => (
        <TreeNode key={child.id} node={child} childrenMap={childrenMap} level={level + 1} t={t} />
      ))}
    </div>
  )
}
