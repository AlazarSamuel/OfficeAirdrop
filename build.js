import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import obfuscator from 'javascript-obfuscator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const targetFile = path.join(__dirname, 'dist-electron', 'main.js')

console.log('[Obfuscator] Starting post-build obfuscation...')

if (!fs.existsSync(targetFile)) {
  console.error(`[Obfuscator] Target file not found: ${targetFile}`)
  process.exit(1)
}

const code = fs.readFileSync(targetFile, 'utf8')

// Aggressive obfuscation settings
const obfuscated = obfuscator.obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false, // Too buggy in Electron IPC contexts
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false
}).getObfuscatedCode()

fs.writeFileSync(targetFile, obfuscated)

console.log(`[Obfuscator] Hardened: main.js`)
console.log('[Obfuscator] Build hardening complete.')
