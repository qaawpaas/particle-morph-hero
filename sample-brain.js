/* PNG -> particle mask sampler. Turns a brain image (bright form on a dark background)
   into points.brain.js for build-shapes.js.
   - places particles weighted by brightness^gamma (bright tissue dense, dark grooves sparse)
   - stores per-point brightness (gyri shading) AND a rim flag (1 near the silhouette edge)
     so the render can trace the brain OUTLINE in gold, like the reference.
   Usage: node sample-brain.js [input.png] [N] [gamma]
   Best source: a filled/photographed brain on black (not line-art). Dev-only. */
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

const IN = process.argv[2] || "brain-new.png";
const N = parseInt(process.argv[3] || "22000", 10);
const GAMMA = parseFloat(process.argv[4] || "1.1", 10);
const { w, h, bpp, px } = decodePNG(fs.readFileSync(path.join(__dirname, IN)));

const luma = new Float32Array(w * h); let maxL = 0;
for (let i = 0; i < w * h; i++){
  const r = px[i * bpp], g = bpp >= 3 ? px[i * bpp + 1] : r, b = bpp >= 3 ? px[i * bpp + 2] : r;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const wgt = Math.pow(L, GAMMA);
  luma[i] = wgt; if (wgt > maxL) maxL = wgt;
}
const lin = (i) => Math.pow(luma[i], 1 / GAMMA);       // back to linear luma 0..1

// rim = fraction of surrounding samples that are background (dark) -> 1 near the silhouette edge, 0 deep inside
const R = Math.max(5, Math.round(Math.min(w, h) * 0.022));
const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]];
const BG = 0.14;
function rimAt(xi, yi){
  let bg = 0;
  for (const [dx, dy] of DIRS){
    const x = Math.round(xi + dx * R), y = Math.round(yi + dy * R);
    if (x < 0 || y < 0 || x >= w || y >= h){ bg++; continue; }
    if (lin(y * w + x) < BG) bg++;
  }
  return bg / DIRS.length;
}

// Sobel gradient magnitude -> edges = gyri fold lines + brain contour, so particles TRACE structure (not fill)
const grad = new Float32Array(w * h); let maxG = 0;
for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++){
  const i = y * w + x;
  const gx = -lin(i-w-1) - 2*lin(i-1) - lin(i+w-1) + lin(i-w+1) + 2*lin(i+1) + lin(i+w+1);
  const gy = -lin(i-w-1) - 2*lin(i-w) - lin(i-w+1) + lin(i+w-1) + 2*lin(i+w) + lin(i+w+1);
  const g = Math.sqrt(gx*gx + gy*gy);
  grad[i] = g; if (g > maxG) maxG = g;
}
const EDGEFILL = 0.18;                                  // edges dominate; small luma term keeps the interior from going empty
const wMax = maxG + EDGEFILL * maxL;

let seed = 20260705;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const aspect = w / h;
const pts = [], rim = []; let made = 0, guard = 0;
while (made < N && guard < N * 400){
  guard++;
  const xi = (rnd() * w) | 0, yi = (rnd() * h) | 0, idx = yi * w + xi;
  if (rnd() * wMax > grad[idx] + EDGEFILL * luma[idx]) continue;   // land on fold-line edges (structure), light fill
  const nx = xi / w - 0.5, ny = (yi / h - 0.5) / aspect;
  const L = lin(idx);
  const bri = Math.max(0, Math.min(1, (L - 0.42) * 1.8 + 0.42));   // contrast stretch -> deeper grooves, brighter ridges
  pts.push(+nx.toFixed(4), +ny.toFixed(4), +bri.toFixed(2));
  rim.push(+rimAt(xi, yi).toFixed(2));
  made++;
}
const out = { w: +aspect.toFixed(4), n: made, pts, rim };
fs.writeFileSync(path.join(__dirname, "points.brain.js"), "window.__BRAIN__=" + JSON.stringify(out) + ";\n");
console.log("sampled " + made + "/" + N + " from " + IN + " (" + w + "x" + h + ", gamma " + GAMMA + ", rimR " + R + ") -> points.brain.js");
