/* PNG -> particle mask sampler for build-shapes.js.
   Goal: a RECOGNISABLE brain — a clean dense OUTLINE (contour) + edge-traced interior gyri.
   Method: coarse-cell silhouette (gap-filled) so the brain reads as one solid region;
   ~45% of particles land densely on its boundary (rim=1 -> gold outline), the rest fill
   the interior weighted by Sobel edges (gyri folds), coloured by local brightness.
   Usage: node sample-brain.js [input.png] [N]
   Best source: a brain on a dark background (photo, render, or a bold engraving). Dev-only. */
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
const N = parseInt(process.argv[3] || "22000", 10);
const CONTOUR_FRAC = 0.45;
const TH = 0.14;                                          // luma above this = "drawn / brain"
const { w, h, bpp, px } = decodePNG(fs.readFileSync(path.join(__dirname, IN)));

// linear luma + Sobel edges
const L = new Float32Array(w * h);
for (let i = 0; i < w * h; i++){
  const r = px[i*bpp], g = bpp>=3?px[i*bpp+1]:r, b = bpp>=3?px[i*bpp+2]:r;
  L[i] = (0.299*r + 0.587*g + 0.114*b) / 255;
}
const grad = new Float32Array(w * h); let maxG = 0;
for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++){
  const i = y*w+x;
  const gx = -L[i-w-1]-2*L[i-1]-L[i+w-1] + L[i-w+1]+2*L[i+1]+L[i+w+1];
  const gy = -L[i-w-1]-2*L[i-w]-L[i-w+1] + L[i+w-1]+2*L[i+w]+L[i+w+1];
  const g = Math.sqrt(gx*gx + gy*gy); grad[i] = g; if (g > maxG) maxG = g;
}

// coarse-cell silhouette: a cell is "brain" if any pixel in it is drawn -> closes hatching gaps
const C = Math.max(3, Math.round(Math.min(w, h) / 150));
const cw = Math.ceil(w / C), ch = Math.ceil(h / C);
let cell = new Uint8Array(cw * ch);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y*w+x] > TH) cell[(y/C|0)*cw + (x/C|0)] = 1;
// fill interior holes: empty cell with >=5 filled 8-neighbours becomes filled (2 passes)
for (let pass = 0; pass < 2; pass++){
  const nx = cell.slice();
  for (let cy = 1; cy < ch-1; cy++) for (let cx = 1; cx < cw-1; cx++){
    const ci = cy*cw+cx; if (cell[ci]) continue;
    let n = 0; for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) if (!(dx===0&&dy===0)) n += cell[(cy+dy)*cw+cx+dx];
    if (n >= 5) nx[ci] = 1;
  }
  cell = nx;
}
// boundary cells: filled cell touching an empty 4-neighbour
const isB = (cx, cy) => cell[cy*cw+cx] && (!cell[cy*cw+cx-1]||!cell[cy*cw+cx+1]||!cell[(cy-1)*cw+cx]||!cell[(cy+1)*cw+cx]);
const contourCells = [], fillCells = [];
for (let cy = 1; cy < ch-1; cy++) for (let cx = 1; cx < cw-1; cx++){
  if (!cell[cy*cw+cx]) continue;
  (isB(cx, cy) ? contourCells : fillCells).push(cy*cw+cx);
}

let seed = 20260705;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const aspect = w / h;
const pts = [], rim = [];
const push = (xf, yf, bri, rimv) => { pts.push(+(xf/w-0.5).toFixed(4), +((yf/h-0.5)/aspect).toFixed(4), +bri.toFixed(2)); rim.push(rimv); };

// 1) CONTOUR — dense bright outline along the silhouette boundary
const nC = Math.min(contourCells.length ? N*CONTOUR_FRAC : 0, N);
for (let k = 0; k < nC; k++){
  const c = contourCells[(rnd()*contourCells.length)|0];
  const cx = c % cw, cy = (c/cw)|0;
  push(cx*C + rnd()*C, cy*C + rnd()*C, 1.0, 1.0);           // rim=1 -> gold, bright
}
// 2) INTERIOR — edge-weighted fill (gyri folds), coloured by brightness
let made = pts.length/3, guard = 0;
const gMax = maxG + 0.12;
while (made < N && guard < N*500){
  guard++;
  const fc = fillCells.length ? fillCells[(rnd()*fillCells.length)|0] : contourCells[(rnd()*contourCells.length)|0];
  const cx = fc % cw, cy = (fc/cw)|0;
  const xi = Math.min(w-1, cx*C + (rnd()*C|0)), yi = Math.min(h-1, cy*C + (rnd()*C|0)), idx = yi*w+xi;
  if (rnd()*gMax > grad[idx] + 0.12) continue;              // land on interior fold edges
  const bri = Math.max(0.1, Math.min(1, (L[idx]-0.42)*1.7 + 0.5));
  push(xi, yi, bri, 0.0);
  made++;
}
const out = { w: +aspect.toFixed(4), n: pts.length/3, pts, rim };
fs.writeFileSync(path.join(__dirname, "points.brain.js"), "window.__BRAIN__=" + JSON.stringify(out) + ";\n");
console.log("sampled " + (pts.length/3) + " (" + contourCells.length + " contour cells, " + fillCells.length + " fill) from " + IN + " -> points.brain.js");
