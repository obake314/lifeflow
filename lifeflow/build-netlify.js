/**
 * Build script for Netlify.
 * Copies public/ → dist/lifeflow/ so the app is served at /lifeflow/.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'public');
const DEST = path.join(__dirname, 'dist', 'lifeflow');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(SRC, DEST);
console.log(`Built: ${SRC} → ${DEST}`);
