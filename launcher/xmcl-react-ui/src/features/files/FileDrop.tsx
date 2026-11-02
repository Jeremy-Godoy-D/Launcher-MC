import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Upload } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useLibrary } from '../library/context'
import { acceptsDrop, droppedFiles, type DroppedFile } from './droppedFiles'
import './files.css'

interface DropTarget { path: string; type: 'mods' | 'resourcepacks' | 'shaderpacks' | 'worlds'; busy: boolean; onFiles: (paths: string[]) => void | Promise<void> }
const Context = createContext<((target: RefObject<DropTarget>) => () => void) | null>(null)
export function useFileDrop(target: DropTarget) {
  const register = useContext(Context), latest = useRef(target); latest.current = target
  useEffect(() => register?.(latest), [register])
}

export function FileDrop({ disabled, onArchive, children }: { disabled: boolean; onArchive: (path: string) => void; children: ReactNode }) {
  const { t } = useI18n(), library = useLibrary(), text = (key: string) => t(`react.files.${key}`)
  const target = useRef<RefObject<DropTarget> | null>(null), pending = useRef(false), returnFocus = useRef<HTMLElement | null>(null)
  const live = useRef({ disabled, onArchive, library }); live.current = { disabled, onArchive, library }
  const [dragging, setDragging] = useState(false), [issue, setIssue] = useState(''), [working, setWorking] = useState(false)
  const [review, setReview] = useState<{ target: DropTarget; files: DroppedFile[]; name: string }>()
  const register = useCallback((value: RefObject<DropTarget>) => { target.current = value; return () => { if (target.current === value) target.current = null } }, [])
  useEffect(() => {
    let depth = 0
    const reset = () => { depth = 0; setDragging(false) }
    const blocked = () => live.current.disabled || pending.current || !!document.querySelector('[role="dialog"],[role="alertdialog"]')
    const files = (event: DragEvent) => !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files')
    const enter = (event: DragEvent) => { if (files(event)) { depth++; if (!blocked()) setDragging(true) } }
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = (event: DragEvent) => { if (files(event)) { event.preventDefault(); event.dataTransfer!.dropEffect = blocked() ? 'none' : 'copy' } }
    const drop = (event: DragEvent) => {
      if (!files(event)) return
      event.preventDefault(); reset()
      if (blocked()) return
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      try {
        if (!window.windowController?.getPathForFile) throw new Error('Native files unavailable')
        const incoming = droppedFiles(Array.from(event.dataTransfer!.files), file => window.windowController!.getPathForFile(file)), current = target.current?.current
        if (!acceptsDrop(current?.type ?? 'archive', incoming)) { setIssue('unsupported'); return }
        if (current) {
          if (current.busy) { setIssue('busy'); return }
          if (current.type === 'worlds') { void Promise.resolve(current.onFiles(incoming.map(file => file.path))).catch(() => setIssue('failed')); return }
          setReview({ target: current, files: incoming, name: live.current.library?.readInstance(current.path)?.name || current.path }); setIssue('')
        } else live.current.onArchive(incoming[0].path)
      } catch { setIssue('failed') }
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') reset() }
    document.addEventListener('dragenter', enter); document.addEventListener('dragleave', leave); document.addEventListener('dragover', over); document.addEventListener('drop', drop); document.addEventListener('dragend', reset); window.addEventListener('blur', reset); window.addEventListener('keydown', key)
    return () => { document.removeEventListener('dragenter', enter); document.removeEventListener('dragleave', leave); document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); document.removeEventListener('dragend', reset); window.removeEventListener('blur', reset); window.removeEventListener('keydown', key) }
  }, [])
  async function confirm() {
    if (!review || pending.current) return
    const current = target.current?.current
    if (disabled || !current || current.path !== review.target.path || current.type !== review.target.type || current.busy) { setIssue('changed'); return }
    pending.current = true; setWorking(true); setIssue('')
    try { await review.target.onFiles(review.files.map(file => file.path)); setReview(undefined) }
    catch { setIssue('failed') }
    finally { pending.current = false; setWorking(false) }
  }
  function close() { if (!pending.current) { setReview(undefined); setIssue('') } }
  return <Context.Provider value={register}>{children}
    {dragging && <div className="file-drop-overlay" data-testid="file-drop-overlay" role="status"><Upload size={32} aria-hidden="true" /><p>{text('drop')}</p></div>}
    <Dialog.Root open={!!review || !!issue} onOpenChange={value => { if (!value) close() }}><Dialog.Portal><Dialog.Overlay className="dialog-backdrop" /><Dialog.Content className="dialog creation-dialog operation-dialog" data-testid="file-drop-review" onCloseAutoFocus={event => { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>('main'))?.focus() }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (pending.current) event.preventDefault() }}>
      <Dialog.Title>{text('title')}</Dialog.Title><Dialog.Description>{text(review ? 'help' : 'errorHelp')}</Dialog.Description>
      <div className="creation-body">{review && <><p><strong>{review.name}</strong> · {t(`react.workspace.${review.target.type === 'resourcepacks' ? 'packs' : review.target.type === 'shaderpacks' ? 'shaders' : review.target.type}`)}</p><p className="instance-path">{review.target.path}</p><ul>{review.files.map(file => <li key={file.path}>{file.name}</li>)}</ul></>}{issue && <p role="alert">{text(issue)}</p>}{working && <p role="status">{text('working')}</p>}</div>
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={working} onClick={close}>{text('cancel')}</button>{review && <button type="button" className="button primary" data-testid="file-drop-confirm" disabled={working || issue === 'changed'} onClick={() => void confirm()}>{text('confirm')}</button>}</div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </Context.Provider>
}
