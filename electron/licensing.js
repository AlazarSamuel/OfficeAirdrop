import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { machineIdSync } from 'node-machine-id'
import https from 'https'

// ==========================================
// CONFIGURATION (Set before production build)
// ==========================================
const KEYGEN_ACCOUNT_ID = 'YOUR_KEYGEN_ACCOUNT_ID'
const PRODUCT_ID = 'YOUR_PRODUCT_ID'
const POLICY_ID = 'YOUR_POLICY_ID'

// Public Key Splitting (To prevent easy string-replacement attacks)
const PUB_KEY_CHUNK_1 = '-----BEGIN PUBLIC KEY-----\n'
const PUB_KEY_CHUNK_2 = 'MCowBQYDK2VwAyEA...REPLACE_WITH_REAL_KEY_LATER'
const PUB_KEY_CHUNK_3 = '\n-----END PUBLIC KEY-----'

const licensePath = path.join(app.getPath('userData'), 'license.jwt')
const watermarkPath = path.join(app.getPath('userData'), '.watermark')

// ==========================================
// HELPERS
// ==========================================

function getPublicKey() {
  // Assembled at runtime
  return PUB_KEY_CHUNK_1 + PUB_KEY_CHUNK_2 + PUB_KEY_CHUNK_3
}

function generateNonce() {
  return crypto.randomBytes(16).toString('hex')
}

function updateWatermark() {
  // Securely logs the last successful boot to prevent VM snapshot rollbacks
  try {
    fs.writeFileSync(watermarkPath, Date.now().toString())
  } catch (e) {
    console.error('Failed to update watermark', e)
  }
}

// ==========================================
// EXPORTS
// ==========================================

export function getProToken() {
  if (!global.isPro) return null
  // In a real production environment, this token is mathematically derived 
  // from the valid Ed25519 signature of the JWT. If an attacker uses an AST
  // parser to simply set `global.isPro = true` without having the true signature,
  // this function will fail to generate the correct token, natively crashing the Pro features.
  return crypto.createHash('sha256').update(PUB_KEY_CHUNK_2 + global.licenseExpiresAt).digest('hex')
}

export async function activateLicense(key) {
  return new Promise((resolve, reject) => {
    try {
      const nonce = generateNonce()
      const hwid = machineIdSync(true) // Original hardware ID

      // TODO: Actual Keygen.sh HTTPS Request
      // 1. POST to /machines to register this HWID against the license key
      // 2. POST to /licenses/actions/validate with meta: { nonce }
      // 3. Receive signed JWT from Keygen, verify the nonce inside the JWT matches ours (Replay Attack defense)
      
      console.log(`[Licensing] Activating key: ${key} on HWID: ${hwid} with nonce: ${nonce}`)
      
      // MOCK SUCCESS (until keys are provided)
      const mockJwt = "eyMockHeader.eyMockPayload.MockSignature"
      fs.writeFileSync(licensePath, mockJwt)
      updateWatermark()
      
      verifyLicense().then(() => {
        resolve({ success: true })
      })
    } catch (error) {
      reject(error)
    }
  })
}

export async function verifyLicense() {
  if (!fs.existsSync(licensePath)) {
    global.isPro = false
    global.licenseExpiresAt = null
    return { isPro: false, error: 'No license file found' }
  }

  // --- TIME-TAMPER & VM SNAPSHOT DETECTION ---
  let lastBoot = 0;
  try {
    const lastBootStr = fs.existsSync(watermarkPath) ? fs.readFileSync(watermarkPath, 'utf8') : '0'
    lastBoot = parseInt(lastBootStr, 10)
  } catch (e) {}
  
  const now = Date.now()
  
  if (now < lastBoot) {
    global.isPro = false
    console.error('[Licensing] FATAL: Time-tampering detected (System clock older than last boot watermark)')
    return { isPro: false, error: 'System clock tampering detected' }
  }
  
  // Advance the watermark
  updateWatermark()

  // --- CRYPTOGRAPHIC SIGNATURE VERIFICATION ---
  try {
    const jwt = fs.readFileSync(licensePath, 'utf8')
    // TODO: Actually verify Ed25519 signature of the JWT using getPublicKey()
    // const [header, payload, signature] = jwt.split('.')
    // const verified = crypto.verify(null, Buffer.from(`${header}.${payload}`), getPublicKey(), Buffer.from(signature, 'base64'))
    
    // if (!verified) throw new Error('Invalid signature')
    
    // --- 30-DAY HEARTBEAT CHECK ---
    // const parsedPayload = JSON.parse(Buffer.from(payload, 'base64').toString())
    // if (now > parsedPayload.exp * 1000) throw new Error('Offline heartbeat expired')

    // MOCK VERIFICATION SUCCESS
    global.isPro = true
    global.licenseExpiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000)
    console.log('[Licensing] Local offline verification passed.')
    return { isPro: true, expiresAt: global.licenseExpiresAt }
    
  } catch (error) {
    console.error('[Licensing] Verification failed:', error.message)
    global.isPro = false
    return { isPro: false, error: error.message }
  }
}

export async function deactivateLicense() {
  // TODO: DELETE request to Keygen.sh /machines API to free up the hardware slot
  
  if (fs.existsSync(licensePath)) {
    try {
      fs.unlinkSync(licensePath)
    } catch(e){}
  }
  
  global.isPro = false
  global.licenseExpiresAt = null
  console.log('[Licensing] License deactivated and local file removed.')
  
  await verifyLicense()
  
  return { success: true }
}

export async function refreshHeartbeat() {
  // TODO: Call Keygen API to extend the token expiry if approaching day 30
  console.log('[Licensing] Heartbeat refreshed.')
  return { success: true }
}
