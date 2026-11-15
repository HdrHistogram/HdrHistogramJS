import { test } from "vitest";
import { PackedArray } from "../packedarray/PackedArray";

// Packed array recording and scanning, on the same seeded inputs on every branch.
// Run it on master and on the branch to compare: only the packedarray sources differ.

// Seeded PRNG so every run and every branch sees the same indexes
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

// Sizes chosen so that neither workload falls back to unpacked storage
const N_CENTRE = 1 << 14;
const N_SPARSE = 1 << 12;
const OPS = 200_000;
const rand = seeded(42);
// contiguous latencies in the centre: a band of 512 indexes
const centre = Array.from(
  { length: OPS },
  () => N_CENTRE / 2 - 256 + Math.floor(rand() * 512)
);
// isolated values across the whole range (tails and sparse)
const sparse = Array.from({ length: OPS }, () => Math.floor(rand() * N_SPARSE));
const counts = Array.from({ length: OPS }, () => 1 + Math.floor(rand() * 3));

const filled = (n: number, indexes: number[]) => {
  const array = new PackedArray(n, 16);
  for (let i = 0; i < indexes.length; i++) array.add(indexes[i], counts[i]);
  return array;
};
const centreFilled = filled(N_CENTRE, centre);
const sparseFilled = filled(N_SPARSE, sparse);

test("Packed array recording", async ({ bench }) => {
  await bench.compare(
    bench("record centre band", () => {
      const array = new PackedArray(N_CENTRE, 16);
      for (let i = 0; i < OPS; i++) array.add(centre[i], counts[i]);
    }),
    bench("record sparse tails", () => {
      const array = new PackedArray(N_SPARSE, 16);
      for (let i = 0; i < OPS; i++) array.add(sparse[i], counts[i]);
    })
  );
});

test("Packed array scans", async ({ bench }) => {
  await bench.compare(
    bench("sequential get, centre-filled", () => {
      let sum = 0;
      for (let i = 0; i < N_CENTRE; i++) sum += centreFilled.get(i);
      return sum;
    }),
    bench("sequential get, sparse-filled", () => {
      let sum = 0;
      for (let i = 0; i < N_SPARSE; i++) sum += sparseFilled.get(i);
      return sum;
    })
  );
});
