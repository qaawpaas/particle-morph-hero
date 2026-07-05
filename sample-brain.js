/* PNG -> particle mask sampler. Turns ANY brain image (bright structure on a dark
   background) into points.brain.js for build-shapes.js.
   Places particles weighted by brightness^gamma, so bright gyri ridges / bold outlines
   get dense coverage and dark grooves/background stay sparse -> the fold structure reads.
   Usage: node sample-brain.js [input.png] [N] [gamma]
   e.g.   node sample-brain.js brain-src.png 20000 1.7
   Dev-only, run once when the source image changes. */
const fs = require("fs"), zlib = require("zlib"), path = require("path");

function decodePNG(buf){
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, ctype = 0, bitDepth = 0; const idat = [];
  while (off < buf.length){
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR"){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; ctype = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (ctype !== 6 && ctype !== 2 && ctype !== 0)) throw new Error("unsupported PNG " + ctype + "/" + bitDepth);
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++){
    const ft = raw[y * (stride + 1)], rs = y * (stride + 1) + 1, os = y * stride;
    for (let x = 0; x < stride; x++){
      const v0 = raw[rs + x], a = x >= bpp ? out[os + x - bpp] : 0, b = y > 0 ? out[os - stride + x] : 0,
            c = x >= bpp && y > 0 ? out[os - stride + x - bpp] : 0;
      let v; if (ft === 0) v = v0; else if (ft === 1) v = v0 + a; else if (ft === 2) v = v0 + b;
      else if (ft === 3) v = v0 + ((a + b) >> 1); else v = v0 + paeth(a, b, c);
      out[os + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

const IN = process.argv[2] || "brain-src.png";
const N = parseInt(process.argv[3] || "20000", 10);
const GAMMA = parseFloat(process.argv[4] || "1.7");
const { w, h, bpp, px } = decodePNG(fs.readFileSync(path.join(__dirname, IN)));

// luma map + max for rejection sampling
const luma = new Float32Array(w * h); let maxL = 0;
for (let i = 0; i < w * h; i++){
  const r = px[i * bpp], g = bpp >= 3 ? px[i * bpp + 1] : r, b = bpp >= 3 ? px[i * bpp + 2] : r;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const wgt = Math.pow(L, GAMMA);              // brightness^gamma -> favour bold structure over faint fill
  luma[i] = wgt; if (wgt > maxL) maxL = wgt;
}

let seed = 20260705;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const aspect = w / h;
const pts = []; let made = 0, guard = 0;
while (made < N && guard < N * 400){
  guard++;
  const xi = (rnd() * w) | 0, yi = (rnd() * h) | 0, idx = yi * w + xi;
  if (rnd() * maxL > luma[idx]) continue;      // reject dark pixels -> particles land on bright structure
  const nx = xi / w - 0.5, ny = (yi / h - 0.5) / aspect;   // proportional, centred, y-down (build flips)
  const bri = Math.min(1, luma[idx] === 0 ? 0 : Math.pow(luma[idx], 1 / GAMMA)); // back to linear luma 0..1
  pts.push(+nx.toFixed(4), +ny.toFixed(4), +bri.toFixed(2));
  made++;
}
const out = { w: +aspect.toFixed(4), n: made, pts };
fs.writeFileSync(path.join(__dirname, "points.brain.js"), "window.__BRAIN__=" + JSON.stringify(out) + ";\n");
console.log("sampled " + made + "/" + N + " pts from " + IN + " (" + w + "x" + h + ", gamma " + GAMMA + ") -> points.brain.js  guard=" + guard);
