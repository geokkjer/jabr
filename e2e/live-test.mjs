/**
 * Live end-to-end check against a running JABR instance, driven through a real
 * browser over the Chrome DevTools Protocol.
 *
 * Dependency-free on purpose: Node's global WebSocket talks to headless
 * Chromium directly, so there is no Playwright/Puppeteer to install or keep
 * up to date. It verifies that actual EPUB and PDF files *render* — epub.js
 * injects content into an iframe, pdf.js paints pixels onto a canvas — and that
 * reading progress round-trips through the API.
 *
 * Usage:
 *   node e2e/live-test.mjs                    # expects http://127.0.0.1:3999
 *   JABR_URL=http://host:port node e2e/live-test.mjs
 *
 * Exits non-zero if any check fails.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.env.JABR_URL || 'http://127.0.0.1:3999'
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium'
const SHOTS = process.env.SHOT_DIR || '/tmp/jabr-live/shots'
const DEBUG_PORT = Number(process.env.CDP_PORT || 9222)

mkdirSync(SHOTS, { recursive: true })

const results = []
const failures = []

function check(name, ok, detail = '') {
  results.push({ name, ok })
  if (!ok) failures.push(name)
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Minimal CDP client over the browser's own WebSocket. */
class Session {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.consoleErrors = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) {
          reject(new Error(JSON.stringify(msg.error)))
        } else {
          resolve(msg.result)
        }
        return
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception')
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const { text, url } = msg.params.entry
        this.consoleErrors.push(url ? `${text} (${url})` : text)
      }
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`))
      }, 30000)
    })
  }

  /** Evaluate an expression in the page and return its value. */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluation failed')
    }
    return res.result.value
  }

  async goto(url, settleMs = 2500) {
    await this.send('Page.navigate', { url })
    await sleep(settleMs)
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${SHOTS}/${file}`, Buffer.from(data, 'base64'))
    return `${SHOTS}/${file}`
  }

  /** Poll an expression until it is truthy, or give up. */
  async waitFor(expression, timeoutMs = 20000, everyMs = 500) {
    const deadline = Date.now() + timeoutMs
    let last
    while (Date.now() < deadline) {
      last = await this.eval(expression).catch(() => undefined)
      if (last) return last
      await sleep(everyMs)
    }
    return last
  }
}

async function waitForDevTools() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch {
      /* not up yet */
    }
    await sleep(150)
  }
  throw new Error('Chromium DevTools endpoint never came up')
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=/tmp/jabr-live/chrome-profile',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)

let session
try {
  const version = await waitForDevTools()
  console.log(`chromium: ${version['Browser']}\n`)

  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
  const pageTarget = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  session = new Session(ws)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Log.enable')

  // ── 1. Library ────────────────────────────────────────────────────────────
  await session.goto(BASE, 3000)
  await session.waitFor(`document.querySelectorAll('div.grid > div').length > 0`)

  const library = await session.eval(`(() => {
    const text = document.body.innerText
    return {
      cards: document.querySelectorAll('div.grid > div').length,
      hasMelville: /Herman Melville/.test(text),
      hasNested: /Geometry of Musical Rhythm/.test(text),
      hasUnknown: /Unknown/.test(text),
    }
  })()`)
  check('library renders book cards', library.cards > 0, `${library.cards} cards`)
  check('author parsed from filename', library.hasMelville)
  check('nested folder scanned', library.hasNested)
  check('unparseable filename falls back to Unknown', library.hasUnknown)
  await session.screenshot('1-library.png')

  // ── 2. EPUB: does epub.js actually render chapter text? ───────────────────
  const epubPath = process.env.EPUB_PATH || 'Classics/Herman Melville - Moby Dick.epub'
  const epubRoute = `${BASE}/read/${encodeURIComponent(epubPath)}`
  await session.goto(epubRoute, 3000)

  const epubLoaded = await session.waitFor(
    `!document.body.innerText.includes('Loading EPUB')`,
    25000,
  )
  check('EPUB finished loading (no infinite spinner)', epubLoaded === true)

  const epub = await session.eval(`(() => {
    const frame = document.querySelector('iframe')
    const doc = frame?.contentDocument
    return {
      iframes: document.querySelectorAll('iframe').length,
      accessible: Boolean(doc),
      chars: doc?.body?.innerText?.trim().length ?? 0,
      images: doc?.querySelectorAll('img').length ?? 0,
      svgs: doc?.querySelectorAll('svg').length ?? 0,
    }
  })()`)
  check('EPUB chapter iframe exists', epub.iframes > 0, `${epub.iframes} iframe(s)`)
  check('EPUB iframe document is accessible', epub.accessible === true)
  // The first spine item is often an image-only cover, so accept ink of any kind
  check(
    'EPUB first page rendered (text or artwork)',
    epub.chars > 200 || epub.images > 0 || epub.svgs > 0,
    `${epub.chars} chars, ${epub.images} img, ${epub.svgs} svg`,
  )
  await session.screenshot('2-epub-cover.png')

  // Turn to a text page — also exercises the progress save path
  await session.eval(
    `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next')?.click()`,
  )
  await sleep(3000)

  const epubText = await session.eval(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument
    return (doc?.body?.innerText ?? '').trim()
  })()`)
  check('EPUB advances to a chapter with text', epubText.length > 200, `${epubText.length} chars`)
  console.log(`         “${epubText.slice(0, 70).replace(/\\s+/g, ' ')}…”`)
  await session.screenshot('2-epub-reader.png')

  // The reader debounces progress saves by 750ms
  await sleep(2000)

  // ── 3. PDF: does pdf.js actually paint pixels? ────────────────────────────
  const pdfPath = process.env.PDF_PATH || 'Music Theory/Adapting the Interface - A Paper.pdf'
  await session.goto(`${BASE}/read/${encodeURIComponent(pdfPath)}`, 3000)

  await session.waitFor(`document.querySelectorAll('canvas').length > 0`, 25000)
  await sleep(3000)

  const pdf = await session.eval(`(() => {
    const canvases = [...document.querySelectorAll('canvas')]
    let painted = 0
    let maxSamples = 0
    for (const c of canvases) {
      const ctx = c.getContext('2d')
      if (!ctx || !c.width) continue
      const { data } = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400))
      let nonWhite = 0
      for (let i = 0; i < data.length; i += 4 * 53) {
        if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) nonWhite++
      }
      if (nonWhite > 20) painted++
      maxSamples = Math.max(maxSamples, nonWhite)
    }
    const counter = document.body.innerText.match(/Page\\s+(\\d+)\\s*\\/\\s*(\\d+)/)
    return { canvases: canvases.length, painted, maxSamples, counter: counter?.[0] ?? null }
  })()`)
  check('PDF canvas exists', pdf.canvases > 0, `${pdf.canvases} canvas element(s)`)
  check('PDF pages are painted, not blank', pdf.painted > 0, `${pdf.painted} painted, ${pdf.maxSamples} ink samples`)
  check('PDF page counter rendered', Boolean(pdf.counter), pdf.counter ?? 'not found')
  await session.screenshot('3-pdf-reader.png')

  // Scroll into the document: lazy rendering + page tracking must follow
  const scrolled = await session.eval(`(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.className.includes('overflow-y-auto') && d.scrollHeight > d.clientHeight)
    if (!el) return null
    el.scrollTop = el.scrollHeight * 0.35
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
  })()`)
  check('PDF viewer is scrollable', Boolean(scrolled), scrolled ? `${scrolled.scrollHeight}px tall` : 'no scroll container')
  await sleep(4000)

  const afterScroll = await session.eval(`(() => ({
    counter: document.body.innerText.match(/Page\\s+(\\d+)\\s*\\/\\s*(\\d+)/)?.[0] ?? null,
    canvases: document.querySelectorAll('canvas').length,
  }))()`)
  const startPage = Number((pdf.counter ?? '').match(/Page\s+(\d+)/)?.[1] ?? 1)
  const nowPage = Number((afterScroll.counter ?? '').match(/Page\s+(\d+)/)?.[1] ?? 1)
  check('scrolling advances the page counter', nowPage > startPage, `${pdf.counter} → ${afterScroll.counter}`)
  check('further PDF pages rendered lazily', afterScroll.canvases > pdf.canvases, `${pdf.canvases} → ${afterScroll.canvases} canvases`)
  await session.screenshot('4-pdf-scrolled.png')

  // ── 4. Progress round-trip ────────────────────────────────────────────────
  // A fresh install has no profile: the app is expected to create a starter
  // one ("Me") on first load so reading progress has somewhere to go.
  const profiles = await (await fetch(`${BASE}/api/profiles`)).json()
  check(
    'starter profile exists automatically',
    Array.isArray(profiles) && profiles.length === 1 && profiles[0]?.name === 'Me',
    JSON.stringify(profiles.map((p) => p.name)),
  )
  const profileId = profiles[0]?.id
  if (profileId) {
    // Give the reader a nudge so a save is triggered with a profile present
    await session.goto(`${BASE}/read/${encodeURIComponent(epubPath)}`, 3000)
    await session.waitFor(`!document.body.innerText.includes('Loading EPUB')`, 20000)
    await session.eval(
      `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next')?.click()`,
    )
    await sleep(2500)

    const progress = await (
      await fetch(`${BASE}/api/progress?profileId=${encodeURIComponent(profileId)}`)
    ).json()
    check('reading progress persisted', Array.isArray(progress) && progress.length > 0, `${progress.length} row(s)`)
    if (Array.isArray(progress) && progress.length) {
      for (const p of progress) {
        console.log(`         ${p.bookId} → ${Math.round(p.percent ?? 0)}% (${p.format})`)
      }
    }
  }

  // ── 5. Console cleanliness ────────────────────────────────────────────────
  const noise = session.consoleErrors.filter((e) => !/favicon/i.test(e))
  check('no browser console errors', noise.length === 0, noise.slice(0, 3).join(' | '))
} catch (err) {
  check('live test ran to completion', false, String(err))
  if (session) await session.screenshot('failure.png').catch(() => {})
} finally {
  chrome.kill('SIGKILL')
}

const passed = results.filter((r) => r.ok).length
console.log(`\nscreenshots in ${SHOTS}`)
console.log(`${passed}/${results.length} checks passed`)
if (failures.length) {
  console.log('failed:', failures.join(', '))
  process.exit(1)
}
