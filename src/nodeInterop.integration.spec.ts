/*
 * Round trips against real native histograms. histogram.export() and
 * perf_hooks.importHistogram() arrived in Node 26.9; on older runtimes
 * these tests are skipped and nodeInterop.spec.ts (which carries a
 * byte-exact re-implementation of Node's encoder) is the coverage.
 */
import * as perfHooks from "node:perf_hooks";
import { build } from "./index";
import JsHistogram from "./JsHistogram";
import { decodeNodeExport, fromNodeExport, toNodeExport } from "./nodeInterop";

const { createHistogram, importHistogram } = perfHooks as any;

const nativeExportAvailable =
  typeof createHistogram === "function" &&
  typeof createHistogram().export === "function" &&
  typeof importHistogram === "function";

describe.skipIf(!nativeExportAvailable)(
  "Node.js native histogram integration",
  () => {
    it("should convert a native export", () => {
      // given
      const native = createHistogram();
      for (let i = 1; i <= 1000; i++) {
        native.record(i * 1000);
      }
      native.record(9999000000);
      // when
      const { histogram } = fromNodeExport(native.export());
      // then
      expect(histogram.totalCount).toBe(native.count);
      [50, 90, 99, 100].forEach((percentile) => {
        expect(histogram.getValueAtPercentile(percentile)).toBe(
          native.percentile(percentile),
        );
      });
      expect(histogram.maxValue).toBe(native.max);
      expect(histogram.minNonZeroValue).toBe(native.min);
      expect(histogram.mean).toBeCloseTo(native.mean, 6);
    });

    it("should produce bytes that importHistogram() accepts", () => {
      // given
      const reference = build({
        lowestDiscernibleValue: 1,
        highestTrackableValue: Number.MAX_SAFE_INTEGER,
        numberOfSignificantValueDigits: 3,
        bitBucketSize: 64,
        autoResize: false,
      }) as JsHistogram;
      for (let i = 1; i <= 1000; i++) {
        reference.recordValue(i * 1000);
      }
      reference.recordValue(9999000000);
      // when
      const native = importHistogram(toNodeExport(reference));
      // then
      expect(native.count).toBe(reference.totalCount);
      [50, 90, 99, 100].forEach((percentile) => {
        expect(native.percentile(percentile)).toBe(
          reference.getValueAtPercentile(percentile),
        );
      });
      expect(native.max).toBe(
        reference.highestEquivalentValue(reference.maxValue),
      );
    });

    it("should clamp the 2^63-1 default highest of a native histogram", () => {
      // given the full native range, as monitorEventLoopDelay defaults to
      const native = createHistogram({ highest: 2n ** 63n - 1n });
      native.record(1500);
      native.record(123456789);
      // when
      const { histogram, header } = fromNodeExport(native.export());
      // then
      expect(header.highest).toBe(Number.MAX_SAFE_INTEGER);
      expect(histogram.totalCount).toBe(2);
      expect(histogram.getValueAtPercentile(100)).toBe(native.percentile(100));
    });

    it("should read the EWMA state of a native histogram", () => {
      // given
      const native = createHistogram({ halfLife: 10, threshold: 2000 });
      if (typeof native.ewmaMean !== "number") {
        return; // EWMA options not supported on this runtime
      }
      for (let i = 1; i <= 100; i++) {
        native.record(1000 + i);
      }
      // when
      const { header } = decodeNodeExport(native.export());
      // then
      expect(header.ewma).toBeDefined();
      expect(header.ewma?.mean).toBeCloseTo(native.ewmaMean, 6);
      expect(header.ewma?.threshold).toBe(2000);
    });
  },
);
