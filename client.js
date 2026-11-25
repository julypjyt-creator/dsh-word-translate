/**
 * Client half of dsh-word-translate.
 *
 * Right-click on a selected word (or on a word under the pointer) inside the
 * conversation and a small menu offers "翻译成中文". The translation itself is
 * performed by the Host half through POST /dsh-word-translate/translate.
 */
window.__ModuleLoader__.load({
  id: 'dsh-word-translate',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'wordTranslate'
    const CARD_WIDTH = 300
    const MAX_TEXT = 800

    const DICTIONARIES = {
      zh: {
        translate: '翻译成中文',
        translating: '翻译中…',
        copy: '复制',
        copied: '已复制',
        copyResult: '复制译文',
        retry: '重试',
        close: '关闭',
        title: '划词翻译',
        failed: '翻译失败，请重试',
        truncated: '文本较长，已截断翻译',
        noLetters: '没有可翻译的英文单词',
      },
      en: {
        translate: 'Translate to Chinese',
        translating: 'Translating…',
        copy: 'Copy',
        copied: 'Copied',
        copyResult: 'Copy translation',
        retry: 'Retry',
        close: 'Close',
        title: 'Word translate',
        failed: 'Translation failed. Try again.',
        truncated: 'Long text was truncated before translating',
        noLetters: 'No English word to translate',
      },
    }

    const FALLBACK = DICTIONARIES.zh

    const CSS = [
      '.wt-root{position:fixed;z-index:95;pointer-events:auto;font:13px/1.55 -apple-system,"PingFang SC","Segoe UI",system-ui,sans-serif;color:var(--dsw-alias-label-primary)}',
      '.wt-card{box-sizing:border-box;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.26);padding:8px;max-height:60vh;display:flex;flex-direction:column;gap:6px}',
      '.wt-head{display:flex;align-items:flex-start;gap:8px}',
      '.wt-word{flex:1;min-width:0;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-top:2px}',
      '.wt-icon{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));cursor:pointer;border-radius:6px;width:20px;height:20px;flex:none;font-size:14px;line-height:1;padding:0}',
      '.wt-icon:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}',
      '.wt-menu{display:flex;flex-direction:column;gap:2px}',
      '.wt-item{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;padding:6px 8px;border-radius:7px}',
      '.wt-item:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}',
      '.wt-item-label{flex:1;min-width:0}',
      '.wt-item-primary{color:var(--dsw-alias-brand-primary,var(--color-blue-500))}',
      '.wt-body{overflow:auto;overscroll-behavior:contain;min-height:20px}',
      '.wt-result{font-size:14px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}',
      '.wt-error{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-secondary));font-size:12px;line-height:1.5;overflow-wrap:anywhere}',
      '.wt-note{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px;margin-top:4px}',
      '.wt-loading{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px;padding:2px 0}',
      '.wt-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary,var(--color-blue-500));animation:wt-pulse 1s ease-in-out infinite}',
      '@keyframes wt-pulse{0%,100%{opacity:.25}50%{opacity:1}}',
      '.wt-foot{display:flex;align-items:center;gap:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:6px;color:var(--dsw-alias-label-secondary);font-size:11.5px}',
      '.wt-link{border:0;background:transparent;color:var(--dsw-alias-brand-primary,var(--color-blue-500));font:inherit;cursor:pointer;padding:0}',
      '.wt-link:hover{text-decoration:underline}',
      '.wt-spacer{flex:1}',
      '.wt-provider{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:10.5px;text-transform:lowercase}',
    ].join('\n')

    /* ---------------------------------------------------------------- state */

    const state = {
      open: false,
      x: 0,
      y: 0,
      word: '',
      status: 'menu',
      result: '',
      error: '',
      provider: '',
      truncated: false,
      copied: false,
    }

    const subscribers = new Set()
    let cardElement = null
    let copyTimer

    const publish = () => {
      for (const listener of subscribers) {
        try {
          listener()
        } catch {}
      }
    }
    const patch = (next) => {
      Object.assign(state, next)
      publish()
    }
    const close = () => {
      if (copyTimer !== undefined) {
        clearTimeout(copyTimer)
        copyTimer = undefined
      }
      if (!state.open) return
      patch({ open: false, status: 'menu', result: '', error: '', provider: '', truncated: false, copied: false })
    }

    /* ------------------------------------------------------------- position */

    function origin() {
      try {
        const transport = window.__DSH_TRANSPORT__
        if (transport && typeof transport.streamBaseUrl === 'string' && transport.streamBaseUrl !== '') {
          return transport.streamBaseUrl.replace(/\/+$/, '')
        }
      } catch {}
      try {
        if (location.protocol === 'http:' || location.protocol === 'https:') return location.origin
      } catch {}
      return ''
    }

    /* -------------------------------------------------------------- fetching */

    let sequence = 0

    async function translate() {
      const text = state.word
      if (text === '') return
      const ticket = ++sequence
      patch({ status: 'loading', error: '', result: '' })
      try {
        const base = origin()
        if (base === '') throw new Error('host origin unavailable')
        const response = await fetch(base + '/dsh-word-translate/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, targetLanguage: 'zh-CN' }),
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const payload = await response.json()
        if (ticket !== sequence || !state.open) return
        if (!payload || payload.ok !== true) throw new Error(String((payload && payload.error) || 'translation failed'))
        patch({
          status: 'done',
          result: String(payload.translation || ''),
          provider: typeof payload.provider === 'string' ? payload.provider : '',
          truncated: payload.truncated === true,
        })
      } catch (error) {
        if (ticket !== sequence || !state.open) return
        patch({ status: 'error', error: String((error && error.message) || error) })
      }
    }

    async function copy(text) {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          area.remove()
        } catch {}
      }
      if (copyTimer !== undefined) clearTimeout(copyTimer)
      patch({ copied: true })
      copyTimer = setTimeout(() => {
        copyTimer = undefined
        patch({ copied: false })
      }, 1400)
    }

    /* -------------------------------------------------------------- triggers */

    function editable(target) {
      if (!(target instanceof Element)) return false
      return target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null
    }

    /** Expand a collapsed caret to the Latin word that contains it. */
    function wordAt(x, y) {
      let range = null
      try {
        if (typeof document.caretRangeFromPoint === 'function') {
          range = document.caretRangeFromPoint(x, y)
        } else if (typeof document.caretPositionFromPoint === 'function') {
          const position = document.caretPositionFromPoint(x, y)
          if (position) {
            range = document.createRange()
            range.setStart(position.offsetNode, position.offset)
            range.collapse(true)
          }
        }
      } catch {
        range = null
      }
      if (!range) return ''
      const node = range.startContainer
      if (!node || node.nodeType !== Node.TEXT_NODE) return ''
      const text = node.nodeValue || ''
      const offset = range.startOffset
      const pattern = /[A-Za-z][A-Za-z'’-]*/g
      let match
      while ((match = pattern.exec(text)) !== null) {
        if (offset >= match.index && offset <= match.index + match[0].length) return match[0]
        if (match.index > offset) break
      }
      return ''
    }

    function open(word, x, y) {
      if (cardElement !== null && !state.open) cardElement = null
      patch({ open: true, x, y, word, status: 'menu', result: '', error: '', provider: '', truncated: false, copied: false })
    }

    function onContextMenu(event) {
      if (event.defaultPrevented) return
      const target = event.target
      if (cardElement !== null && target instanceof Node && cardElement.contains(target)) return
      if (editable(target)) return
      let text = ''
      const selection = window.getSelection()
      if (selection !== null && !selection.isCollapsed) text = selection.toString()
      if (text.trim() === '') text = wordAt(event.clientX, event.clientY)
      text = text.replace(/\s+/g, ' ').trim()
      if (text === '' || !/[A-Za-z]/.test(text)) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      open(text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text, event.clientX, event.clientY)
    }

    function onPointerDown(event) {
      if (!state.open) return
      if (cardElement !== null && event.target instanceof Node && cardElement.contains(event.target)) return
      close()
    }

    function onKeyDown(event) {
      if (event.key !== 'Escape' || !state.open) return
      event.stopPropagation()
      close()
    }

    function onScroll(event) {
      if (!state.open) return
      if (cardElement !== null && event.target instanceof Node && cardElement.contains(event.target)) return
      close()
    }

    function onResize() {
      close()
    }

    /* ------------------------------------------------------------- component */

    function Card(props) {
      const t = props && typeof props.t === 'function' ? props.t : (key) => FALLBACK[key] || key
      const [, bump] = React.useState(0)
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1)
        subscribers.add(listener)
        return () => {
          subscribers.delete(listener)
        }
      }, [])
      if (!state.open) {
        cardElement = null
        return null
      }
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.max(8, Math.min(state.x + 2, vw - CARD_WIDTH - 8))
      const flip = state.y > vh * 0.55
      const placement = flip
        ? { left, bottom: Math.max(8, vh - state.y + 6) }
        : { left, top: Math.max(8, state.y + 6) }

      const head = h('div', { className: 'wt-head', key: 'head' },
        h('span', { className: 'wt-word', title: state.word }, state.word),
        h('button', {
          className: 'wt-icon',
          type: 'button',
          title: t('close'),
          'aria-label': t('close'),
          onClick: close,
        }, '×'),
      )

      let body = null
      let foot = null
      if (state.status === 'menu') {
        body = h('div', { className: 'wt-menu', key: 'menu' },
          h('button', { className: 'wt-item wt-item-primary', type: 'button', onClick: () => void translate() },
            h('span', { className: 'wt-item-label' }, t('translate'))),
          h('button', { className: 'wt-item', type: 'button', onClick: () => void copy(state.word) },
            h('span', { className: 'wt-item-label' }, t('copy'))),
        )
      } else if (state.status === 'loading') {
        body = h('div', { className: 'wt-body', key: 'loading' },
          h('div', { className: 'wt-loading' },
            h('span', { className: 'wt-dot' }),
            h('span', null, t('translating'))))
      } else if (state.status === 'error') {
        body = h('div', { className: 'wt-body', key: 'error' },
          h('div', { className: 'wt-error' }, state.error || t('failed')))
        foot = h('div', { className: 'wt-foot', key: 'foot' },
          h('button', { className: 'wt-link', type: 'button', onClick: () => void translate() }, t('retry')),
          h('span', { className: 'wt-spacer' }))
      } else {
        body = h('div', { className: 'wt-body', key: 'result' },
          h('div', { className: 'wt-result', lang: 'zh-CN' }, state.result),
          state.truncated ? h('div', { className: 'wt-note' }, t('truncated')) : null)
        foot = h('div', { className: 'wt-foot', key: 'foot' },
          h('button', { className: 'wt-link', type: 'button', onClick: () => void copy(state.result) },
            state.copied ? t('copied') : t('copyResult')),
          h('button', { className: 'wt-link', type: 'button', onClick: () => void translate() }, t('retry')),
          h('span', { className: 'wt-spacer' }),
          state.provider !== '' ? h('span', { className: 'wt-provider' }, state.provider) : null)
      }

      return h('div', {
        className: 'wt-root',
        style: Object.assign({ width: CARD_WIDTH + 'px' }, placement),
        ref: (element) => {
          cardElement = element
        },
      }, h('div', { className: 'wt-card' }, head, body, foot))
    }

    /* ----------------------------------------------------------------- plugin */

    return {
      name: 'dsh-word-translate',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'word translate: dictionaries')
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-word-translate'
        style.textContent = CSS
        document.head.appendChild(style)
        window.addEventListener('contextmenu', onContextMenu, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('scroll', onScroll, true)
        window.addEventListener('resize', onResize)
        ctx.effect(() => () => {
          window.removeEventListener('contextmenu', onContextMenu, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('scroll', onScroll, true)
          window.removeEventListener('resize', onResize)
          style.remove()
        }, 'word translate: listeners')
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'word-translate',
          order: 950,
          label: 'Word translate',
          locale: NS,
        }, Card))
      },
    }
  },
})
