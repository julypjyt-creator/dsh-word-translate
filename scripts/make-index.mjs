#!/usr/bin/env node
/**
 * Build `market/index.json` for this bundle — the one JSON file a DSH plugin
 * market reads (format 1). Registry publish time or Git commit are pinned, so
 * rerun this after every publish and commit the result.
 *
 *   node scripts/make-index.mjs                     # npm source, uses now as the timestamp
 *   node scripts/make-index.mjs --timestamp 1790000000
 *   node scripts/make-index.mjs --git-url https://github.com/user/repo --commit <40-hex>
 *   node scripts/make-index.mjs --out /tmp/index.json   # write somewhere else
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf('--' + name)
  return index === -1 ? undefined : argv[index + 1]
}

const gitUrl = flag('git-url')
const commit = flag('commit')
const out = path.resolve(flag('out') || path.join(root, 'market', 'index.json'))
const timestamp = Number(flag('timestamp') || Math.floor(Date.now() / 1000))

if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp >= 1e11) {
  throw new Error('--timestamp must be an integer Unix timestamp in seconds')
}
if (gitUrl !== undefined && !/^[0-9a-f]{40}$/.test(String(commit))) {
  throw new Error('a git source needs --commit with a lowercase 40-hex SHA')
}

const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).meta
const en = read('locale/en.json')
const zh = read('locale/zh.json')

const iconName = 'word-translate.svg'
const iconDir = path.join(path.dirname(out), 'icons')
fs.mkdirSync(iconDir, { recursive: true })
fs.copyFileSync(path.join(root, 'icon.svg'), path.join(iconDir, iconName))

const metadata = {
  category: 'productivity',
  keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
}

const plugin = {
  name: pkg.name,
  title: { en: en.title, zh: zh.title },
  description: { en: en.description, zh: zh.description },
  icon: 'icons/' + iconName,
  metadata,
  'dist-tags': { latest: pkg.version },
  versions: [
    {
      version: pkg.version,
      publishTimestamp: timestamp,
      source: gitUrl
        ? { type: 'git', url: String(gitUrl), commit: String(commit) }
        : { type: 'npm' },
      engines: { dsh: pkg.engines.dsh },
    },
  ],
}
if (pkg.author) plugin.author = typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '') : pkg.author.name
if (pkg.homepage) plugin.homepage = pkg.homepage
if (pkg.repository && pkg.repository.url) {
  plugin.repository = { url: String(pkg.repository.url).replace(/^git\+/, '').replace(/\.git$/, '') }
}

const index = {
  format: 1,
  title: { en: en.title, zh: zh.title },
  description: {
    en: 'Translate English words in the DSH conversation from the right-click menu.',
    zh: '在 DSH 对话里右击英文单词即可翻译成中文。',
  },
  metadata: {
    categories: {
      productivity: { title: { en: 'Productivity', zh: '效率' } },
    },
  },
  plugins: [plugin],
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(index, null, 2) + '\n')
console.log('wrote ' + out + ' (' + pkg.name + '@' + pkg.version + ', ' + (gitUrl ? 'git' : 'npm') + ' source)')
