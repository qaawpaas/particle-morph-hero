/* Build the THREE volumetric attractor shapes for the scroll morph:
   BRAIN (3D volume) -> LIGHTBULB (3D revolution + filament) -> EARTH (globe w/ lat-long grid).
   Reads points.brain.js (window.__BRAIN__ = mask sample) for the brain silhouette.
   Writes points.js: window.__SHAPES__ = { n, brain, bulb, earth } normalised ~[-0.5..0.5], y-up.
   Scatter/dispersed state is procedural in index.html. Run: node build-shapes.js */
const fs = require("fs"), path = require("path");
const DIR = __dirname;
const BRAIN = JSON.parse(fs.readFileSync(path.join(DIR, "points.brain.js"), "utf8")
  .replace(/^\s*window\.__BRAIN__\s*=\s*/, "").replace(/;\s*$/, ""));
const N = 11000;

let seed = 20260704;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
// cheap value noise for gyri / continents
function hash3(x, y, z){ let h = Math.sin(x*127.1 + y*311.7 + z*74.7) * 43758.5453; return h - Math.floor(h); }

const brain = new Array(N * 3), bulb = new Array(N * 3), earth = new Array(N * 3), bri = new Array(N);
const land = new Array(N).fill(0);                          // per-point: 1 = land (continent), 0 = ocean/grid
const rimArr = new Array(N).fill(0);                        // per-point: brain silhouette-edge strength (for gold contour)
const bn = BRAIN.n, bp = BRAIN.pts, brim = BRAIN.rim || [];

/* centroid + radius of the brain mask (for the volume bulge) */
let cx = 0, cy = 0;
for (let i = 0; i < bn; i++){ cx += bp[i*3]; cy += bp[i*3+1]; }
cx /= bn; cy /= bn;

/* ---------- 1. BRAIN — real volume: silhouette + centre-bulge depth + gyri ---------- */
for (let i = 0; i < N; i++){
  const src = Math.floor((i / N) * bn) * 3;
  const nx = bp[src], ny = bp[src + 1];
  const b = bp[src + 2];
  bri[i] = b;                                              // source brightness = gyri shading
  rimArr[i] = brim[src / 3] || 0;                          // silhouette-edge strength -> gold contour
  const r = Math.min(1, Math.hypot(nx - cx, ny - cy) / 0.46);
  const bulge = Math.max(0, 1 - r * r);                    // 1 centre .. 0 edge
  const round = Math.sqrt(bulge);                          // ROUNDED ellipsoid cross-section (not a flat lens)
  // gyri as a HEIGHTMAP: engraving crests bulge OUT of the shell, sulci sink in -> real 3D relief
  const relief = Math.max(0, b - 0.5) * 0.30 + (hash3(nx*9, ny*9, 0) - 0.5) * 0.05 * bulge;
  const shell = (rnd() < 0.55 ? 1 : -1);                   // near-symmetric shell: see-through volume, not a dense front wall
  const thick = (rnd() * 2 - 1) * 0.04;                    // thin surface thickness (not a filled blob)
  brain[i*3]     = nx;
  brain[i*3 + 1] = -ny;                                     // y up
  brain[i*3 + 2] = shell * (round * 0.28 + relief) + thick; // rounded volume + gyri relief, moderate depth
}

/* ---------- 2. LIGHTBULB — surface of revolution + glowing filament coil ---------- */
function bulbR(y){
  if (y < -0.16) return 0.10 + 0.02 * Math.max(0, Math.sin((y + 0.5) * 60)); // screw base + threads
  if (y < -0.02){ const t = (y + 0.16) / 0.14; return 0.075 + t * (0.20 - 0.075); } // neck flare
  const R = 0.29, cyy = 0.16, d = R*R - (y - cyy)*(y - cyy);                 // round glass bulb
  return d > 0 ? Math.sqrt(d) : 0;
}
const FIL = Math.floor(N * 0.12);
let made = 0, guard = 0;
while (made < N - FIL && guard < N * 80){
  guard++;
  const y = -0.5 + rnd() * 0.94;
  const r = bulbR(y);
  if (r <= 0) continue;
  if (rnd() > r / 0.29) continue;                 // weight by circumference -> even surface
  const a = rnd() * Math.PI * 2;
  bulb[made*3]     = Math.cos(a) * r;
  bulb[made*3 + 1] = y;
  bulb[made*3 + 2] = Math.sin(a) * r;
  made++;
}
for (let k = 0; made < N; k++, made++){          // filament: bright 3D coil inside the glass
  const s = (k % FIL) / FIL, ang = s * Math.PI * 2 * 7, rr = 0.05 + Math.sin(s * Math.PI) * 0.02;
  bulb[made*3]     = Math.cos(ang) * rr;
  bulb[made*3 + 1] = -0.02 + s * 0.24;
  bulb[made*3 + 2] = Math.sin(ang) * rr;
}

/* ---------- 3. EARTH — a real globe: dense CONTINENTS on a sparse ocean + grid ----------
   Continents = metaball landmasses at roughly real lat/lon; land is densely
   sampled so it reads as continents, ocean stays sparse, plus faint lat/long grid. */
const D2R = Math.PI / 180;
// USA faces the camera (+z front). offset so geographic lon -100° maps to +z: φ = 90 - (-100) = 190°.
const FRONT = 190 * D2R;
// [lat°, lon°, angular radius rad] — richer nodes so landmasses read (esp. the Americas up front)
const CONT = [
  // North America (Canada, USA, USA-south, Mexico) + Greenland
  [60,-100,0.28],[46,-100,0.20],[38,-96,0.18],[26,-102,0.13],[72,-42,0.13],
  // South America (elongated)
  [-6,-62,0.26],[-22,-62,0.20],[-40,-66,0.13],
  // Africa
  [10,18,0.32],[-10,24,0.26],[30,8,0.16],
  // Europe
  [50,14,0.17],[60,30,0.16],
  // Asia (large) + India + far east
  [55,90,0.42],[28,78,0.24],[62,140,0.22],
  // Australia + Antarctica
  [-25,134,0.20],[-82,0,0.50]
];
function landDist(lat, lon){
  let best = 9;
  for (let k = 0; k < CONT.length; k++){
    const la = CONT[k][0]*D2R, lo = CONT[k][1]*D2R, r = CONT[k][2];
    const dot = Math.sin(lat)*Math.sin(la) + Math.cos(lat)*Math.cos(la)*Math.cos(lon-lo);
    const d = Math.acos(Math.max(-1, Math.min(1, dot))) - r;   // <0 => inside this continent
    if (d < best) best = d;
  }
  return best;
}
function isLand(lat, lon){
  const edge = (hash3(lat*4, lon*4, 7) - 0.5) * 0.28;          // ragged coastlines
  return landDist(lat, lon) + edge < 0;
}
const GA = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++){
  let lat, lon; const kind = rnd(); let isL = false;
  if (kind < 0.82){                                            // LAND (dense continents)
    let g = 0;
    do { const t = rnd(); lat = Math.asin(1 - 2*t); lon = rnd()*Math.PI*2 - Math.PI; g++; }
    while (!isLand(lat, lon) && g < 80);
    isL = isLand(lat, lon);
  } else if (kind < 0.88){                                     // ocean (very sparse)
    const t = (i + 0.5) / N; lat = Math.asin(1 - 2*t); lon = i * GA;
  } else if (kind < 0.94){                                     // meridians
    lon = (Math.floor(rnd()*12)/12)*Math.PI*2; lat = (rnd()-0.5)*Math.PI;
  } else {                                                     // parallels
    lat = (Math.floor(rnd()*7)/6 - 0.5)*Math.PI; lon = rnd()*Math.PI*2;
  }
  land[i] = isL ? 1 : 0;
  const cl = Math.cos(lat), lo = lon + FRONT;                  // FRONT offset -> Americas face the camera
  earth[i*3]     = Math.cos(lo) * cl * 0.5;
  earth[i*3 + 1] = Math.sin(lat) * 0.5;
  earth[i*3 + 2] = Math.sin(lo) * cl * 0.5;
}

const round = (arr) => arr.map((v) => +v.toFixed(4));
const out = { n: N, brain: round(brain), bulb: round(bulb), earth: round(earth), bri: bri.map((v) => +v.toFixed(2)), land, rim: rimArr.map((v) => +v.toFixed(2)) };
fs.writeFileSync(path.join(DIR, "points.js"), "window.__SHAPES__=" + JSON.stringify(out) + ";\n");
console.log("wrote points.js  n=" + N + "  bytes=" + fs.statSync(path.join(DIR, "points.js")).size);
