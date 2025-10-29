#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build, loadConfigFromFile } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WEB_ROOT = path.resolve(__dirname, '..')
const SRC_ROOT = path.resolve(WEB_ROOT, 'src')
const OUT_DIR = path.resolve(WEB_ROOT, 'dist', 'widgets')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')
const PUBLIC_DIR = fs.existsSync(path.join(WEB_ROOT, 'public')) ? path.join(WEB_ROOT, 'public') : false

const ENTRY_FILES = ['index.tsx', 'index.jsx', 'index.ts', 'index.js', 'main.tsx', 'main.jsx', 'main.ts', 'main.js']
const CSS_EXTENSIONS = new Set(['.css', '.pcss', '.scss', '.sass'])
const CSS_MODULE_REGEX = /\.module\./i
const GLOBAL_CSS_CANDIDATES = ['index.css', 'global.css', path.join('styles', 'index.css')]

const BUILD_MODE = process.env.NODE_ENV ?? 'production'

async function main() {
  ensureDirectoryExists(SRC_ROOT)
  const entryTargets = discoverEntries()

  if (entryTargets.length === 0) {
    console.warn('No entry apps found under src/. Nothing to build.')
    return
  }

  console.log(`Found ${entryTargets.length} entry app${entryTargets.length === 1 ? '' : 's'}: ${entryTargets.map((t) => t.name).join(', ')}`)

  prepareOutput()

  const configEnv = { command: 'build', mode: BUILD_MODE }
  const configResult = await loadConfigFromFile(configEnv, undefined, WEB_ROOT)
  const baseConfig = configResult?.config ?? {}
  const basePlugins = (baseConfig.plugins ?? []).slice()

  /** @type {Record<string, { js: string, css: string | null, rootId: string }>} */
  const manifest = {}

  for (const target of entryTargets) {
    const virtualId = `\0virtual-entry:${target.entryFile}`
    const cssToInclude = selectCss(target)
    const plugins = [
      ...basePlugins,
      wrapEntryPlugin(virtualId, target.entryFile, cssToInclude),
      removeManualChunksPlugin(),
    ]

    const entryConfig = {
      ...baseConfig,
      root: baseConfig.root ?? WEB_ROOT,
      mode: BUILD_MODE,
      base: baseConfig.base ?? './',
      publicDir: baseConfig.publicDir ?? PUBLIC_DIR,
      plugins,
      build: {
        ...(baseConfig.build ?? {}),
        target: baseConfig.build?.target ?? 'es2022',
        outDir: OUT_DIR,
        assetsDir: '.',
        emptyOutDir: false,
        cssCodeSplit: true,
        rollupOptions: {
          ...(baseConfig.build?.rollupOptions ?? {}),
          input: virtualId,
          output: {
            format: 'es',
            inlineDynamicImports: true,
            entryFileNames: `${target.name}.js`,
            chunkFileNames: `${target.name}-[hash].js`,
            assetFileNames: (info) => {
              const name = info.name ?? ''
              if (name.endsWith('.css')) {
                return `${target.name}.css`
              }
              return `${target.name}-[hash][extname]`
            },
            preserveModules: false,
          },
        },
      },
      logLevel: baseConfig.logLevel ?? 'info',
    }

    console.log(`\nBuilding widget "${target.name}" from ${path.relative(WEB_ROOT, target.entryFile)}`)
    await build(entryConfig)

    const widgetJsPath = path.join(OUT_DIR, `${target.name}.js`)
    const widgetCssPath = path.join(OUT_DIR, `${target.name}.css`)

    ensureFileExists(widgetJsPath, `Expected JavaScript output for "${target.name}" not found: ${widgetJsPath}`)

    const cssExists = fs.existsSync(widgetCssPath)
    manifest[target.name] = {
      js: toPosixPath(path.relative(path.join(WEB_ROOT, 'dist'), widgetJsPath)),
      css: cssExists ? toPosixPath(path.relative(path.join(WEB_ROOT, 'dist'), widgetCssPath)) : null,
      rootId: target.rootId,
    }

    console.log(`✓ Built ${target.name} (${cssExists ? 'js + css' : 'js'})`)
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ entries: manifest }, null, 2))
  console.log(`\nWidget manifest written to ${path.relative(WEB_ROOT, MANIFEST_PATH)}`)
}

function discoverEntries() {
  const dirEntries = fs.readdirSync(SRC_ROOT, { withFileTypes: true })
  const entries = []

  for (const dirent of dirEntries) {
    if (!dirent.isDirectory()) continue
    if (dirent.name.startsWith('.')) continue

    const entryDir = path.join(SRC_ROOT, dirent.name)
    const entryFile = resolveEntryFile(entryDir)
    if (!entryFile) {
      console.warn(`Skipping "${dirent.name}" – no entry file (${ENTRY_FILES.join(', ')}) found.`)
      continue
    }

    const entrySource = fs.readFileSync(entryFile, 'utf8')
    const rootId = detectRootId(entrySource, dirent.name)

    entries.push({
      name: dirent.name,
      entryFile,
      entrySource,
      rootId,
    })
  }

  return entries
}

function selectCss(target) {
  const globalCss = GLOBAL_CSS_CANDIDATES
    .map((candidate) => path.join(SRC_ROOT, candidate))
    .filter((candidatePath) => fs.existsSync(candidatePath))

  const perEntryCss = collectCssFiles(path.dirname(target.entryFile))
  const deduped = Array.from(new Set([...globalCss, ...perEntryCss]))
  return filterCssAlreadyImported(deduped, target.entryFile, target.entrySource)
}

function resolveEntryFile(entryDir) {
  for (const candidate of ENTRY_FILES) {
    const candidatePath = path.join(entryDir, candidate)
    if (fs.existsSync(candidatePath)) {
      return candidatePath
    }
  }
  return null
}

function collectCssFiles(startDir) {
  /** @type {string[]} */
  const results = []
  /** @type {string[]} */
  const queue = [startDir]

  while (queue.length > 0) {
    const current = queue.pop()
    if (!current) continue
    const dirEntries = fs.readdirSync(current, { withFileTypes: true })

    for (const dirent of dirEntries) {
      if (dirent.isDirectory()) {
        if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) continue
        queue.push(path.join(current, dirent.name))
        continue
      }

      const ext = path.extname(dirent.name).toLowerCase()
      if (!CSS_EXTENSIONS.has(ext)) continue
      if (CSS_MODULE_REGEX.test(dirent.name)) continue

      results.push(path.join(current, dirent.name))
    }
  }

  return results
}

function detectRootId(entrySource, fallbackName) {
  const match = entrySource.match(/getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/)
  if (match && match[1]) {
    return match[1]
  }
  return `${fallbackName}-root`
}

function wrapEntryPlugin(virtualId, entryFile, cssPaths) {
  return {
    name: `virtual-entry-wrapper:${entryFile}`,
    resolveId(id) {
      if (id === virtualId) return id
      return null
    },
    load(id) {
      if (id !== virtualId) return null

      const cssImports = cssPaths
        .map((cssPath) => `import ${JSON.stringify(cssPath)};`)
        .join('\n')

      const banner = cssImports.length > 0 ? `${cssImports}\n\n` : ''

      return `${banner}export * from ${JSON.stringify(entryFile)};
import ${JSON.stringify(entryFile)};`
    },
  }
}

function removeManualChunksPlugin() {
  return {
    name: 'remove-manual-chunks',
    outputOptions(options) {
      if (Array.isArray(options)) {
        return options.map((opt) => {
          if (opt.manualChunks) {
            delete opt.manualChunks
          }
          return opt
        })
      }
      if (options && options.manualChunks) {
        delete options.manualChunks
      }
      return options
    },
  }
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`)
  }
}

function prepareOutput() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function ensureFileExists(file, message) {
  if (!fs.existsSync(file)) {
    throw new Error(message)
  }
}

function filterCssAlreadyImported(cssPaths, entryFile, entrySource) {
  const entryDir = path.dirname(entryFile)
  const normalizedSource = entrySource.replace(/\r\n/g, '\n')

  return cssPaths.filter((cssPath) => {
    const relative = path.relative(entryDir, cssPath).split(path.sep).join('/')
    const normalizedRelative = relative.startsWith('.') ? relative : `./${relative}`
    const importRegex = new RegExp(`import\\s+['"]${escapeForRegex(normalizedRelative)}['"]`)
    return !importRegex.test(normalizedSource)
  })
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
