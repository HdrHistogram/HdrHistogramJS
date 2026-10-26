// Compares two builds of the WASM module in the same process, on the same
// seeded workload, and prints a per-operation speedup table.
//
//   npm run asbuild:optimized && cp build/optimized.wasm /tmp/before.wasm
//   ... change assembly/ ...
//   npm run asbuild:optimized
//   node src/bench/wasm-compare.mjs /tmp/before.wasm build/optimized.wasm
//
import { readFileSync } from "node:fs";

const [baselinePath, simdPath] = process.argv.slice(2);
const imports = { env: { abort(_m, _f, l, c) { throw new Error(`abort ${l}:${c}`); } } };

async function load(path) {
  const { instance } = await WebAssembly.instantiate(readFileSync(path), imports);
  return instance.exports;
}

// Deterministic PRNG so both binaries see identical data.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; }

// Returns median ns/op across `rounds`, each round running `iters` iterations.
function time(fn, iters, rounds = 15) {
  for (let i = 0; i < Math.max(50, iters >> 2); i++) fn(); // warm-up
  const samples = [];
  for (let r = 0; r < rounds; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    samples.push(Number(process.hrtime.bigint() - t0) / iters);
  }
  return median(samples);
}

const SCENARIOS = [
  // Mirrors src/bench: default build() = lowest 1, highest 2, 3 digits, autoResize; values up to 2^53.
  { name: "wide (0..2^53, 3 digits)", lowest: 1, highest: 2, digits: 3, maxValue: Number.MAX_SAFE_INTEGER, n: 1024 },
  // Typical latency histogram: up to 1e7 µs, 3 digits.
  { name: "latency (0..1e7, 3 digits)", lowest: 1, highest: 1e7, digits: 3, maxValue: 1e7, n: 1024 },
  // Dense small histogram.
  { name: "dense (0..1e5, 2 digits)", lowest: 1, highest: 1e5, digits: 2, maxValue: 1e5, n: 100000 },
];

function makePair(w, suf, sc, seed) {
  const r = rng(seed);
  const ctor = suf === "Packed" ? "newPackedHistogram" : `newHistogram${suf}`;
  const a = w[ctor](sc.lowest, sc.highest, sc.digits, true);
  const b = w[ctor](sc.lowest, sc.highest, sc.digits, true);
  for (let i = 0; i < sc.n; i++) {
    w[`recordValueWithCount${suf}`](a, Math.floor(r() * sc.maxValue), Math.floor(r() * 100) + 1);
    w[`recordValueWithCount${suf}`](b, Math.floor(r() * sc.maxValue), Math.floor(r() * 100) + 1);
  }
  return [a, b];
}

function suite(w, suf, sc) {
  const out = {};
  const [a, b] = makePair(w, suf, sc, 42);
  out["p99"] = time(() => w[`getValueAtPercentile${suf}`](a, 99), 2000);
  out["p50"] = time(() => w[`getValueAtPercentile${suf}`](a, 50), 2000);
  out["p99.99"] = time(() => w[`getValueAtPercentile${suf}`](a, 99.99), 2000);
  // add then subtract keeps `a` bounded (no overflow in 8/16-bit storage).
  const kind = suf === "Packed" ? "PackedHistogram" : `Histogram${suf}`;
  const addFn = w[`add${kind}to${suf}`], subFn = w[`subtract${kind}from${suf}`];
  out["add+sub"] = time(() => { addFn(a, b); subFn(a, b); }, 1000);
  out["reset"] = time(() => w[`reset${suf}`](a), 2000);
  return out;
}

const base = await load(baselinePath);
const simd = await load(simdPath);
const rows = [];
for (const sc of SCENARIOS) {
  for (const suf of ["8", "16", "32", "64", "Packed"]) {
    const rb = suite(base, suf, sc);
    const rs = suite(simd, suf, sc);
    for (const op of Object.keys(rb)) {
      rows.push({ scenario: sc.name, type: suf, op, base: rb[op], simd: rs[op], speedup: rb[op] / rs[op] });
    }
  }
}
const fmt = (ns) => ns >= 1000 ? (ns / 1000).toFixed(2) + " µs" : ns.toFixed(0) + " ns";
console.log("scenario | type | op | baseline | simd | speedup");
for (const r of rows) console.log(`${r.scenario} | ${r.type} | ${r.op} | ${fmt(r.base)} | ${fmt(r.simd)} | ${r.speedup.toFixed(2)}x`);
