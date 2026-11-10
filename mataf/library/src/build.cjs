#!/usr/bin/env node
// Encrypt a prepared library with an existing owner password. Never rotates credentials.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [dataPath, libraryDir, corpusZip, passwordFile, outArg] = process.argv.slice(2);
if (!dataPath || !libraryDir || !corpusZip || !passwordFile) {
  console.error('Usage: node build.cjs data.json library-directory corpus.zip password-file [output-directory]');
  process.exit(1);
}
const password = fs.readFileSync(passwordFile, 'utf8').replace(/\r?\n$/, '');
if (!password) throw new Error('Empty password file');
const out = outArg || path.join(__dirname, 'dist');
const data = fs.readFileSync(dataPath);
const parsed = JSON.parse(data.toString('utf8'));
const salt = crypto.randomBytes(16);
const key = crypto.pbkdf2Sync(password, salt, 300000, 32, 'sha256');
function encrypt(bytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([salt, iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}
fs.mkdirSync(path.join(out,'sources'), {recursive:true});
fs.writeFileSync(path.join(out,'data.enc'), encrypt(data));
fs.writeFileSync(path.join(out,'mataf-library-2026-11-09-v3.zip.enc'), encrypt(fs.readFileSync(corpusZip)));
for (const s of parsed.sources) {
  if (!s.has_pdf) continue;
  const source = path.join(libraryDir, s.pdf_path);
  fs.writeFileSync(path.join(out, s.pdf_path+'.enc'), encrypt(fs.readFileSync(source)));
}
for (const f of ['index.html','app.js','style.css']) fs.copyFileSync(path.join(__dirname,f),path.join(out,f));
console.log('Encrypted library built. Owner password unchanged. Review file paths in app.js if adding sources.');
