/**
 * Host half of dsh-word-translate.
 *
 * The browser half asks for one translation per look-up. This half talks to the
 * anonymous machine-translation endpoints (Bing Edge first, Google as a
 * fallback), bounds every request, and keeps a small in-memory cache so that
 * right-clicking the same word twice is instant.
 *
 * No credentials are involved: both endpoints are the public ones a browser
 * translation feature uses.
 */

export const name = 'dsh-word-translate'

export const inject = ['webServer']

const BING_ENDPOINT = 'https://edge.microsoft.com/translate/translatetext'
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

const MAX_TEXT_CHARS = 2000
const MAX_BODY_BYTES = 16 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const TIMEOUT_MS = 10_000
const CACHE_LIMIT = 500

const ROUTE_BASE = '/dsh-word-translate'

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

/** Simplified/Traditional Chinese need provider-specific tags. */
function language(tag, provider) {
  const lower = String(tag || 'zh-CN').toLowerCase()
  const traditional = ['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].includes(lower)
  if (provider === 'google') return traditional ? 'zh-TW' : 'zh-CN'
  return traditional ? 'zh-Hant' : 'zh-Hans'
}

function expired(controller, signal) {
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const done = () => clearTimeout(timer)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
  return done
}

/** One bounded JSON/plain response body read. */
async function boundedJson(response) {
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('translation response too large')
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('translation endpoint returned invalid JSON')
  }
}

/** Read a bounded request body; throws an error carrying `status` 413. */
async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error('request body too large')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function translateBing(text, target) {
  const url = new URL(BING_ENDPOINT)
  url.searchParams.set('to', language(target, 'bing'))
  url.searchParams.set('isEnterpriseClient', 'false')
  const controller = new AbortController()
  const done = expired(controller)
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify([text]),
      headers: { 'content-type': 'application/json', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!response.ok) throw new Error('bing HTTP ' + response.status)
    const payload = await boundedJson(response)
    const value = payload && payload[0] && payload[0].translations && payload[0].translations[0] && payload[0].translations[0].text
    if (typeof value !== 'string') throw new Error('bing returned an invalid translation')
    return value
  } finally {
    done()
  }
}

async function translateGoogle(text, target) {
  const url = new URL(GOOGLE_ENDPOINT)
  const form = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: language(target, 'google'), dt: 't', q: text })
  for (const key of form.keys()) url.searchParams.delete(key)
  const controller = new AbortController()
  const done = expired(controller)
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: form.toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!response.ok) throw new Error('google HTTP ' + response.status)
    const payload = await boundedJson(response)
    const segments = payload && payload[0]
    if (!Array.isArray(segments)) throw new Error('google returned an invalid translation')
    return segments.map((segment) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : '')).join('')
  } finally {
    done()
  }
}

export function apply(ctx, config = {}) {
  const requested = Array.isArray(config.providers)
    ? config.providers.filter((p) => p === 'bing' || p === 'google')
    : []
  const providers = requested.length > 0 ? requested : ['bing', 'google']
  const targetLanguage = typeof config.targetLanguage === 'string' ? config.targetLanguage : 'zh-CN'
  const maxChars = Number.isFinite(config.maxChars) ? Math.min(config.maxChars, MAX_TEXT_CHARS) : MAX_TEXT_CHARS

  const cache = new Map()
  const remember = (key, value) => {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
    cache.set(key, value)
  }

  async function translate(text, target) {
    const key = target + '\u0000' + text
    const hit = cache.get(key)
    if (hit !== undefined) return { translation: hit.translation, provider: hit.provider, cached: true }
    const failures = []
    for (const provider of providers) {
      try {
        const translation = provider === 'google'
          ? await translateGoogle(text, target)
          : await translateBing(text, target)
        if (translation === '') throw new Error('empty translation')
        remember(key, { translation, provider })
        return { translation, provider, cached: false }
      } catch (error) {
        failures.push(provider + ': ' + String((error && error.message) || error))
      }
    }
    const error = new Error(failures.join('; ') || 'no translation provider available')
    error.code = 'TRANSLATION_FAILED'
    throw error
  }

  const route = ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/translate',
    handler: async (request, response) => {
      const respond = (status, body, extra) => {
        const payload = JSON.stringify(body)
        response.writeHead(status, Object.assign({}, HEADERS, { 'content-length': Buffer.byteLength(payload) }, extra))
        response.end(payload)
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, HEADERS)
        response.end()
        return
      }
      if (request.method !== 'POST') {
        respond(405, { ok: false, error: 'POST only' }, { allow: 'POST, OPTIONS' })
        return
      }
      let payload
      try {
        payload = JSON.parse(await readBody(request))
      } catch (error) {
        const tooLarge = Boolean(error && error.status === 413)
        respond(tooLarge ? 413 : 400, {
          ok: false,
          error: tooLarge ? 'request body too large' : 'invalid JSON body',
        })
        return
      }
      const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
      if (text === '') {
        respond(400, { ok: false, error: 'empty text' })
        return
      }
      if (!/[A-Za-z]/.test(text)) {
        respond(400, { ok: false, error: 'no Latin letters to translate' })
        return
      }
      const target = typeof payload?.targetLanguage === 'string' ? payload.targetLanguage : targetLanguage
      try {
        const result = await translate(text.slice(0, maxChars), target)
        respond(200, {
          ok: true,
          translation: result.translation,
          provider: result.provider,
          cached: result.cached,
          truncated: text.length > maxChars,
        })
      } catch (error) {
        ctx.logger?.debug?.(`word translate failed: ${String((error && error.message) || error)}`)
        respond(200, { ok: false, error: String((error && error.message) || error) })
      }
    },
  }), 'word translate: route')

  const health = ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_BASE + '/health',
    resource: async () => new Response(JSON.stringify({
      ok: true,
      plugin: name,
      providers,
      targetLanguage,
      maxChars,
      cached: cache.size,
    }), { status: 200, headers: HEADERS }),
  }), 'word translate: health')

  return () => {
    try {
      route()
    } catch {}
    try {
      health()
    } catch {}
  }
}
