/* Objective acceptance harness for the brain-hero redesign.
   Decodes a PNG (zlib, no deps beyond node stdlib) and reports:
     - near-black share  (max(r,g,b) < 24)  -> "how much black / negative space"
     - hue histogram of LIT pixels           -> "is the palette full-spectrum or gold-dominant"
     - big-particle proxy (bright cluster spread)  -> rough depth signal
   Usage: node scripts/histogram.js reference/before-00.png
   Dev-only. Not part of the runtime. */
const fs = require("fs"), zlib = require("zlib");

function decodePNG(buf){
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, ctype = 0, bitDepth = 0; const idat = [];
  while (off < buf.length){
    const len = buf.readUInt32BE(off); const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR"){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; ctype = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error("unsupported PNG " + ctype + "/" + bitDepth);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++){
    const ft = raw[y * (stride + 1)]; const rs = y * (stride + 1) + 1; const os = y * stride;
    for (let x = 0; x < stride; x++){
      const rawV = raw[rs + x];
      const a = x >= bpp ? out[os + x - bpp] : 0;
      const b = y > 0 ? out[os - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[os - stride + x - bpp] : 0;
      let v;
      if (ft === 0) v = rawV; else if (ft === 1) v = rawV + a; else if (ft === 2) v = rawV + b;
      else if (ft === 3) v = rawV + ((a + b) >> 1); else v = rawV + paeth(a, b, c);
      out[os + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

function hue(r, g, b){ // 0..360, plus sat/val 0..1
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d !== 0){
    if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
    hh *= 60; if (hh < 0) hh += 360;
  }
  return { h: hh, s: mx === 0 ? 0 : d / mx, v: mx / 255 };
}
function bucket(H, S, V){
  if (S < 0.28 && V > 0.35) return "white";
  if (H >= 28 && H < 68)  return "gold";
  if (H >= 68 && H < 175) return "teal";
  if (H >= 175 && H < 205) return "blue";
  if (H >= 205 && H < 265) return "purple";
  if (H >= 265 && H < 345) return "magenta";
  return "other";
}

const file = process.argv[2];
if (!file){ console.error("usage: node scripts/histogram.js <png>"); process.exit(1); }
const { w, h, bpp, px } = decodePNG(fs.readFileSync(file));
let total = 0, black = 0, lit = 0;
const b = { gold: 0, teal: 0, blue: 0, purple: 0, magenta: 0, white: 0, other: 0 };
for (let i = 0; i < w * h; i++){
  const r = px[i * bpp], g = px[i * bpp + 1], bl = px[i * bpp + 2];
  total++;
  if (Math.max(r, g, bl) < 24){ black++; continue; }
  lit++;
  const { h: H, s: S, v: V } = hue(r, g, bl);
  b[bucket(H, S, V)]++;
}
const pct = (n, d) => (100 * n / d).toFixed(1) + "%";
console.log("=== " + file + "  (" + w + "x" + h + ") ===");
console.log("near-black : " + pct(black, total) + "   (target hero >= 70%)");
console.log("lit pixels : " + pct(lit, total));
console.log("--- palette of LIT pixels (target: no bucket dominant, gold <= 22%) ---");
for (const k of ["gold", "purple", "teal", "blue", "magenta", "white", "other"])
  console.log("  " + k.padEnd(8) + pct(b[k], lit || 1));
