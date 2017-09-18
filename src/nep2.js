// this code draws heavily from functions written originally by snowypowers

import bs58check from 'bs58check'
import C, { SHA256, AES, enc } from 'crypto-js'
import scrypt from 'js-scrypt'
import { getAccountsFromWIFKey, getAccountsFromPrivateKey, generatePrivateKey, getWIFFromPrivateKey } from './wallet'
import { ab2hexstring, hexXor } from './utils'

// specified by nep2, same as bip38
const NEP_HEADER = '0142'
const NEP_FLAG = 'e0'
const SCRYPT_OPTS = {
  cost: 16384,
  blockSize: 8,
  parallel: 8,
  size: 64
}

/**
 * Encrypts an WIF key with a given passphrase, returning a Promise<Account>.
 * @param {string} wif - The WIF key to encrypt.
 * @param {string} passphrase - The password.
 * @return {Promise<Account>} A Promise returning an Account object.
 */
export const encryptWifAccount = (wif, passphrase) => {
  return encryptWIF(wif, passphrase).then((encWif) => {
    const loadAccount = getAccountsFromWIFKey(wif)
    return {
      wif: wif,
      address: loadAccount[0].address,
      encryptedWif: encWif,
      passphrase: passphrase
    }
  })
}

/**
 * Decrypts an NEP2 key with a given passphrase, returning a Promise<Account>.
 * @param {string} wif - The NEP2 key to encrypt.
 * @param {string} passphrase - The password.
 * @return {Promise<Account>} A Promise returning an Account object.
 */
export const generateEncryptedWif = (passphrase) => {
  const newPrivateKey = generatePrivateKey()
  const newWif = getWIFFromPrivateKey(newPrivateKey)
  return encryptWIF(newWif, passphrase).then((encWif) => {
    const loadAccount = getAccountsFromWIFKey(newWif)
    return {
      wif: newWif,
      address: loadAccount[0].address,
      encryptedWif: encWif,
      passphrase: passphrase
    }
  })
}

/**
 * Encrypts a WIF key using a given keyphrase under NEP-2 Standard.
 * @param {string} wifKey - WIF key to encrypt (52 chars long).
 * @param {string} keyphrase - The password. Will be encoded as UTF-8.
 * @param {function} progressCallback - This is currently useless with the selected scrypt package
 * @returns {string} The encrypted key in Base58 (Case sensitive).
 */
const encrypt = (wifKey, keyphrase, progressCallback) => {
  const address = getAccountsFromWIFKey(wifKey)[0].address
  const privateKey = getAccountsFromWIFKey(wifKey)[0].privatekey
    // SHA Salt (use the first 4 bytes)
  const addressHash = SHA256(SHA256(enc.Latin1.parse(address))).toString().slice(0, 8)
    // Scrypt
  const derived = scrypt.hashSync(Buffer.from(keyphrase, 'utf8'), Buffer.from(addressHash, 'hex'), SCRYPT_OPTS, progressCallback).toString('hex')
  const derived1 = derived.slice(0, 64)
  const derived2 = derived.slice(64)
    // AES Encrypt
  const xor = hexXor(privateKey, derived1)
  const encrypted = AES.encrypt(enc.Hex.parse(xor), enc.Hex.parse(derived2), { mode: C.mode.ECB, padding: C.pad.NoPadding })
    // Construct
  const assembled = NEP_HEADER + NEP_FLAG + addressHash + encrypted.ciphertext.toString()
  return bs58check.encode(Buffer.from(assembled, 'hex'))
}

/**
 * Decrypts an encrypted key using a given keyphrase under NEP-2 Standard.
 * @param {string} encryptedKey - The encrypted key (58 chars long).
 * @param {string} keyphrase - The password. Will be encoded as UTF-8.
 * @param {function} progressCallback - This is currently useless with the selected scrypt package
 * @returns {string} The decrypted WIF key.
 */
const decrypt = (encryptedKey, keyphrase, progressCallback) => {
  const assembled = ab2hexstring(bs58check.decode(encryptedKey))
  const addressHash = assembled.substr(6, 8)
  const encrypted = assembled.substr(-64)
  const derived = scrypt.hashSync(Buffer.from(keyphrase, 'utf8'), Buffer.from(addressHash, 'hex'), SCRYPT_OPTS, progressCallback).toString('hex')
  const derived1 = derived.slice(0, 64)
  const derived2 = derived.slice(64)
  const ciphertext = { ciphertext: enc.Hex.parse(encrypted), salt: '' }
  const decrypted = AES.decrypt(ciphertext, enc.Hex.parse(derived2), { mode: C.mode.ECB, padding: C.pad.NoPadding })
  const privateKey = hexXor(decrypted.toString(), derived1)
  const address = getAccountsFromPrivateKey(privateKey)[0].address
  const newAddressHash = SHA256(SHA256(enc.Latin1.parse(address))).toString().slice(0, 8)
  if (addressHash !== newAddressHash) throw new Error('Wrong Password!')
  return getWIFFromPrivateKey(Buffer.from(privateKey, 'hex'))
}

// helpers to wrap synchronous functions in promises

export const encryptWIF = (wif, passphrase) => {
  return (new Promise((resolve, reject) => {
    resolve(encrypt(wif, passphrase))
  }))
}

export const decryptWIF = (encrypted, passphrase) => {
  return (new Promise((resolve, reject) => {
    resolve(decrypt(encrypted, passphrase))
  }))
}
