import { build, BuildRequest, Histogram } from "../index";

// Latency-like samples (nanoseconds, 100us to 10ms) in a histogram that tracks up to
// 10 seconds. Fixed-seed PRNG so runs and branches see the same values.
const SAMPLE_COUNT = 1024;
const HIGHEST = 10_000_000_000;
const samples: number[] = (() => {
  let seed = 42;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from(
    { length: SAMPLE_COUNT },
    () => 100_000 + Math.floor(next() * 9_900_000)
  );
})();

const request = (bitBucketSize: unknown): BuildRequest => ({
  bitBucketSize: bitBucketSize as BuildRequest["bitBucketSize"],
  lowestDiscernibleValue: 1,
  highestTrackableValue: HIGHEST,
  numberOfSignificantValueDigits: 3,
});

// On master "auto" is not a valid bitBucketSize, so its entries are skipped there.
const autoSupported = (() => {
  try {
    build(request("auto"));
    return true;
  } catch {
    return false;
  }
})();

const modes: Array<[string, unknown]> = [
  ["Int32Histogram", 32],
  ["Float64Histogram", 64],
];
if (autoSupported) {
  modes.push(["AutoCountsHistogram", "auto"]);
}
// COUNTS_BENCH_ONLY=32,auto runs one variant per process, so the variants do not
// share call sites (and their type feedback) when measured.
const only = process.env.COUNTS_BENCH_ONLY?.split(",");
const selected = only
  ? modes.filter(([, bitBucketSize]) => only.includes(String(bitBucketSize)))
  : modes;

// bench.compare needs two or more entries; a single variant runs on its own.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runAll = (bench: any, benches: any[]) =>
  benches.length > 1 ? bench.compare(...benches) : benches[0].run();

// Fresh histogram per batch: the counts stay at the narrow width the data needs,
// and the cost of allocating the counts array is included (as in a Recorder interval).
test("Record 1024 samples into a fresh histogram", async ({ bench }) => {
  const benches = selected.map(([name, bitBucketSize]) =>
    bench(name, () => {
      const histogram = build(request(bitBucketSize));
      for (let i = 0; i < samples.length; i++) {
        histogram.recordValue(samples[i]);
      }
    })
  );
  await runAll(bench, benches);
});

// Long-lived histogram: after warm-up the auto histogram has promoted to the width
// its counts need, so this measures the steady state.
test("Record 1024 samples into a long-lived histogram", async ({ bench }) => {
  const histograms = selected.map(([name, bitBucketSize]) => ({
    name,
    histogram: build(request(bitBucketSize)),
  }));
  const benches = histograms.map(({ name, histogram }) =>
    bench(name, () => {
      for (let i = 0; i < samples.length; i++) {
        histogram.recordValue(samples[i]);
      }
    })
  );
  await runAll(bench, benches);
});

// Percentile scans over a histogram whose counts are small (auto stays at 8 bits).
const filled = selected.map(([name, bitBucketSize]) => {
  const histogram: Histogram = build(request(bitBucketSize));
  for (let i = 0; i < samples.length; i++) {
    histogram.recordValue(samples[i]);
  }
  return { name, histogram };
});

test("getValueAtPercentile(99)", async ({ bench }) => {
  const benches = filled.map(({ name, histogram }) =>
    bench(name, () => {
      histogram.getValueAtPercentile(99);
    })
  );
  await runAll(bench, benches);
});

test("summary (percentiles, max, totalCount)", async ({ bench }) => {
  const benches = filled.map(({ name, histogram }) =>
    bench(name, () => {
      histogram.summary;
    })
  );
  await runAll(bench, benches);
});
