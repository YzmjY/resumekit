import { useMemo, useState } from 'react'
import {
  GENERIC_FAMILIES,
  KNOWN_FONTS,
  formatFontStack,
  isFontAvailable,
  parseFontStack
} from '../lib/font-availability'

interface FontStackFieldProps {
  label: string
  hint?: string
  /** 当前 font-family 值 */
  value: string
  /** 留空表示跟随正文字体 */
  allowEmpty?: boolean
  onChange: (value: string) => void
  /** 预览用的示例文本 */
  previewText?: string
  previewSize?: number
}

/**
 * 字体选择器：把 CSS 字体回退链呈现为「按优先级排列的字体名」，
 * 并标出本机是否真的装了该字体，避免用户面对一串看不懂的 CSS 值。
 */
export function FontStackField({
  label,
  hint,
  value,
  allowEmpty = false,
  onChange,
  previewText = '中文 AaBbGg 0123',
  previewSize = 15
}: FontStackFieldProps) {
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState('')

  const families = useMemo(() => parseFontStack(value), [value])

  const firstAvailable = useMemo(() => {
    for (const family of families) {
      if (isFontAvailable(family)) return family
    }
    return null
  }, [families])

  const options = useMemo(() => {
    const used = new Set(families)
    const list = KNOWN_FONTS.filter((name) => !used.has(name)).map((name) => ({
      name,
      available: isFontAvailable(name)
    }))
    // 本机可用的排在前面，减少误选
    return list.sort((a, b) => Number(b.available) - Number(a.available))
  }, [families])

  const update = (next: string[]): void => onChange(formatFontStack(next))

  const addFamily = (name: string): void => {
    const trimmed = name.trim()
    if (!trimmed || families.includes(trimmed)) return
    update([...families, trimmed])
    setAdding(false)
    setCustomName('')
  }

  return (
    <div className="field">
      <label className="field__label">
        {label}
        {allowEmpty ? <span className="field__hint">留空 = 跟随正文</span> : null}
      </label>

      {families.length === 0 ? (
        <div className="fontstack__empty">跟随正文字体</div>
      ) : (
        <div className="fontstack">
          <div className="fontstack__resolved">
            实际使用：
            <strong>{firstAvailable ?? '无可用字体（将回退到系统默认）'}</strong>
            {firstAvailable && firstAvailable !== families[0] ? (
              <span className="badge" title={`${families[0]} 在本机不存在，已自动跳过`}>
                跳过 {families[0]}
              </span>
            ) : null}
          </div>

          <ol className="fontstack__list">
            {families.map((family, index) => {
              const available = isFontAvailable(family)
              return (
                <li key={`${family}-${index}`} className="fontstack__item">
                  <span className="fontstack__rank">{index + 1}</span>
                  <span className={`fontstack__dot${available ? ' fontstack__dot--ok' : ''}`} />
                  <span className="fontstack__name" title={available ? '本机已安装' : '本机未安装，仅在装了该字体的电脑上生效'}>
                    {family}
                  </span>
                  {!available ? <span className="fontstack__miss">未安装</span> : null}
                  <span className="fontstack__actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="上移（提高优先级）"
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...families]
                        const [moved] = next.splice(index, 1)
                        next.splice(index - 1, 0, moved)
                        update(next)
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="下移"
                      disabled={index === families.length - 1}
                      onClick={() => {
                        const next = [...families]
                        const [moved] = next.splice(index, 1)
                        next.splice(index + 1, 0, moved)
                        update(next)
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      title="从名单中移除"
                      onClick={() => update(families.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="fontstack__preview" style={{ fontFamily: value, fontSize: previewSize }}>
            {previewText}
          </div>
        </div>
      )}

      {adding ? (
        <div className="fontstack__add">
          <input
            className="input"
            autoFocus
            placeholder="输入字体名后回车，例如 思源黑体 / Source Han Sans SC"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addFamily(customName)
              } else if (event.key === 'Escape') {
                setAdding(false)
                setCustomName('')
              }
            }}
          />
          <div className="fontstack__options">
            {GENERIC_FAMILIES.map((item) => (
              <button key={item.value} type="button" className="fontstack__option" onClick={() => addFamily(item.value)}>
                <span className="fontstack__option-label" title={item.label}>{item.label}</span>
                <span className="fontstack__option-name">{item.value}</span>
              </button>
            ))}
            {options.slice(0, 24).map((option) => (
              <button
                key={option.name}
                type="button"
                className={`fontstack__option${option.available ? ' fontstack__option--ok' : ''}`}
                onClick={() => addFamily(option.name)}
                title={option.available ? '本机已安装' : '本机未安装'}
              >
                <span className="fontstack__option-label" title={option.name}>{option.name}</span>
                <span className="fontstack__option-mark">{option.available ? '本机有' : '未安装'}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn--sm" onClick={() => addFamily(customName)} disabled={!customName.trim()}>
              添加
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setAdding(false)
                setCustomName('')
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn--sm" onClick={() => setAdding(true)}>
            + 添加候选字体
          </button>
          {families.length > 1 ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              title="只保留本机已安装的那些字体"
              onClick={() => {
                const kept = families.filter((family) => isFontAvailable(family))
                update(kept.length > 0 ? kept : families.slice(0, 1))
              }}
            >
              只留本机有的
            </button>
          ) : null}
        </div>
      )}

      {hint ? <div className="field__hint">{hint}</div> : null}
    </div>
  )
}
