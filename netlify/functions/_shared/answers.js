// The vault code words, checked on the server only (this file is never sent to a browser).
// One salted SHA-256 per room: sha256(`${VAULT_SALT}|${room}|${WORD}`), WORD in capitals, so the
// words themselves are not written here either. To change a word, recompute its hash:
//   node -e 'console.log(require("crypto").createHash("sha256").update("cer-vault-2026|osint|NEWWORD").digest("hex"))'
// (and change the word in that room's JS, which hands it to the player).

import { createHash, timingSafeEqual } from 'node:crypto';

export const CORE_ROOMS = ['phishing', 'osint', 'incident', 'mfa', 'crypto'];

export const ROOM_LABELS = {
  phishing: 'Phishing',
  osint: 'OSINT',
  incident: 'Incident Management',
  mfa: 'MFA',
  crypto: 'Encryption',
  forensics: 'Forensics'
};

const VAULT_SALT = 'cer-vault-2026';
const SLOT_HASHES = {
  phishing: '10b2f8bd4bf60485170cd8cec72a37d30081361c2fef4846d40ce1da9a282a20',
  osint: 'fdb8926d5972a73a5528140090665e3563017c80bb42d30a302ae74522ff8f2d',
  incident: 'a54cb56e99787a0adfde640f678b28844cd9be15b3c972d7ef7866187ea4e900',
  mfa: 'ce6e3eb959ebcbc99edc9ec55b01d510298b306eddc98c601e2d6c5e3dbf836b',
  crypto: '4a48c4b8f0bec07419e1a50a82f4ea1e5c060931d126cf68dd8559b1c44995b9'
};

// 'shadow ' -> 'SHADOW'; anything that isn't a short string -> ''.
export function normalizeWord(word) {
  if (typeof word !== 'string') return '';
  const clean = word.trim().toUpperCase();
  return clean.length <= 40 ? clean : '';
}

// True only when `word` is that core room's code word (any case, surrounding spaces ignored).
export function checkWord(room, word) {
  const expected = SLOT_HASHES[room];
  const clean = normalizeWord(word);
  if (!expected || !clean) return false;
  const got = createHash('sha256').update(`${VAULT_SALT}|${room}|${clean}`).digest();
  return timingSafeEqual(got, Buffer.from(expected, 'hex'));
}
