import { useLayoutEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'

export function ArgumentEditor({ id, title, value, disabled, change }: { id: string; title: string; value: readonly string[] | undefined; disabled: boolean; change: (value: string[] | undefined) => void }) {
  const { t } = useI18n(), fields = useRef(new Map<number, HTMLTextAreaElement>()), add = useRef<HTMLButtonElement>(null), focus = useRef<number | 'add' | null>(null)
  useLayoutEffect(() => {
    if (focus.current !== null) { (focus.current === 'add' ? add.current : fields.current.get(focus.current))?.focus(); focus.current = null }
  }, [value])
  function move(index: number, offset: number) {
    const next = [...value!]; [next[index], next[index + offset]] = [next[index + offset], next[index]]
    focus.current = index + offset; change(next)
  }
  return <div className="argument-editor">
    <label htmlFor={`${id}-mode`}>{title}</label>
    <select id={`${id}-mode`} aria-label={t('react.instanceSettings.argumentMode', { title })} disabled={disabled} value={value === undefined ? 'inherit' : 'custom'} onChange={event => change(event.target.value === 'inherit' ? undefined : [])}>
      <option value="inherit">{t('react.instanceSettings.argumentsInherit')}</option><option value="custom">{t('react.instanceSettings.argumentsCustom')}</option>
    </select>
    <p id={`${id}-help`} className="text-muted">{t(value === undefined ? 'react.instanceSettings.argumentsInherited' : 'react.instanceSettings.argumentsHelp')}</p>
    {value !== undefined && <>
      {!value.length && <p className="text-muted">{t('react.instanceSettings.argumentsEmpty')}</p>}
      <ol className="argument-items">{value.map((argument, index) => <li className="argument-row" key={index}>
        <textarea ref={element => { if (element) fields.current.set(index, element); else fields.current.delete(index) }} aria-label={t('react.instanceSettings.argumentValue', { title, index: index + 1 })} aria-describedby={`${id}-help`} placeholder={t('react.instanceSettings.argumentEmptyValue')} rows={argument.includes('\n') ? 2 : 1} spellCheck={false} value={argument} disabled={disabled} onChange={event => change(value.map((old, at) => at === index ? event.target.value : old))} />
        <div className="argument-actions">
          <button type="button" className="icon-button" disabled={disabled || !index} aria-label={t('react.instanceSettings.argumentUp', { title, index: index + 1 })} onClick={() => move(index, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={disabled || index === value.length - 1} aria-label={t('react.instanceSettings.argumentDown', { title, index: index + 1 })} onClick={() => move(index, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={t('react.instanceSettings.argumentRemove', { title, index: index + 1 })} onClick={() => { focus.current = value.length === 1 ? 'add' : Math.min(index, value.length - 2); change(value.filter((_, at) => at !== index)) }}><Trash2 size={16} aria-hidden="true" /></button>
        </div>
      </li>)}</ol>
      <button ref={add} type="button" className="button secondary argument-add" aria-label={t('react.instanceSettings.argumentAdd', { title })} disabled={disabled} onClick={() => { focus.current = value.length; change([...value, '']) }}><Plus size={16} aria-hidden="true" />{t('react.instanceSettings.argumentAddShort')}</button>
    </>}
  </div>
}
