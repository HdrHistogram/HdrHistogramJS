import { build } from "./index";
import JsHistogram from "./JsHistogram";
import { initWebAssembly, WasmHistogram } from "./wasm";
import {
  decodeNodeExport,
  encodeNodeExport,
  fromNodeExport,
  toNodeExport,
} from "./nodeInterop";

const buildJsHistogram = (
  lowestDiscernibleValue = 1,
  highestTrackableValue = Number.MAX_SAFE_INTEGER,
  numberOfSignificantValueDigits: 1 | 2 | 3 | 4 | 5 = 3,
) =>
  build({
    lowestDiscernibleValue,
    highestTrackableValue,
    numberOfSignificantValueDigits,
    bitBucketSize: 64,
    autoResize: false,
  }) as JsHistogram;

describe("Node.js native histogram interop", () => {
  it("should round trip over the full default range", () => {
    // given
    const reference = buildJsHistogram();
    [1, 42, 1000, 123456, 98765432100, Math.pow(2, 53) - 2].forEach((value) =>
      reference.recordValue(value),
    );
    // when
    const { histogram } = fromNodeExport(toNodeExport(reference));
    // then
    expect(histogram.totalCount).toBe(reference.totalCount);
    expect(histogram.minNonZeroValue).toBe(reference.minNonZeroValue);
    // the bucket edge, as Node's own max getter reports
    expect(histogram.maxValue).toBe(
      reference.highestEquivalentValue(reference.maxValue),
    );
    [10, 25, 50, 75, 90, 99, 100].forEach((percentile) => {
      expect(histogram.getValueAtPercentile(percentile)).toBe(
        reference.getValueAtPercentile(percentile),
      );
    });
    expect(histogram.mean).toBe(reference.mean);
    expect(histogram.stdDeviation).toBe(reference.stdDeviation);
  });

  it("should handle the event-loop-delay layout and the EWMA sub-map", () => {
    // given lowest=1000 as monitorEventLoopDelay uses
    const reference = buildJsHistogram(1000, 10e9);
    for (let i = 0; i < 5000; i++) {
      reference.recordValue(1e6 + i * 1000);
    }
    reference.recordValue(9999000000);
    const ewma = {
      alpha: 0.129449436703876,
      mean: 1052341.25,
      variance: 12345.5,
      errorRate: 0.0125,
      threshold: 50000000,
    };
    // when
    const data = encodeNodeExport(reference, ewma);
    const { histogram, header } = fromNodeExport(data);
    // then
    expect(histogram.totalCount).toBe(5001);
    expect(histogram.getValueAtPercentile(99)).toBe(
      reference.getValueAtPercentile(99),
    );
    // bucket edges, as Node's own min/max getters report
    expect(histogram.maxValue).toBe(
      reference.highestEquivalentValue(9999000000),
    );
    expect(histogram.minNonZeroValue).toBe(
      reference.lowestEquivalentValue(1e6),
    );
    expect(header.ewma).toStrictEqual(ewma);
  });

  it("should convert an empty histogram", () => {
    // given
    const reference = buildJsHistogram();
    // when
    const { histogram, header } = fromNodeExport(toNodeExport(reference));
    // then
    expect(histogram.totalCount).toBe(0);
    expect(header.ewma).toBeUndefined();
  });

  it("should keep sparse figures-5 exports small", () => {
    // given two samples a trillion apart
    const reference = buildJsHistogram(1, Number.MAX_SAFE_INTEGER, 5);
    reference.recordValue(1000);
    reference.recordValue(1000000000000);
    // when
    const data = toNodeExport(reference);
    const { header, indices, counts } = decodeNodeExport(data);
    // then
    expect(data.length).toBeLessThan(80);
    expect(header.totalCount).toBe(2);
    expect(indices.length).toBe(2);
    expect(indices[0]).toBeLessThan(indices[1]);
    expect(Array.from(counts)).toStrictEqual([1, 1]);
  });

  it("should skip unknown keys in version 2 and reject them in version 1", () => {
    // a map {0: version, 99: "foo"} crafted by hand
    const version2 = Uint8Array.from([
      0xa2, 0x00, 0x02, 0x18, 0x63, 0x63, 0x66, 0x6f, 0x6f,
    ]);
    expect(decodeNodeExport(version2).header.version).toBe(2);
    const version1 = Uint8Array.from(version2);
    version1[2] = 0x01;
    expect(() => decodeNodeExport(version1)).toThrow(
      "unknown key 99 in version 1 histogram export",
    );
  });

  it("should reject a total count that does not match the bucket counts", () => {
    // given
    const reference = buildJsHistogram();
    reference.recordValue(42);
    reference.setTotalCount(7);
    // when then
    expect(() => fromNodeExport(toNodeExport(reference))).toThrow(
      "total count mismatch",
    );
  });

  it("should clamp a native highest of 2^63-1 and accept the longer layout", () => {
    // given an export as a default native histogram writes it:
    // highest = 2^63-1 (9 CBOR bytes), counts_len = 55296 while the
    // clamped JS layout has 45056 slots
    const data = Uint8Array.from([
      0xa6, // map(6)
      0x00,
      0x02, // version 2
      0x01,
      0x01, // lowest 1
      0x02,
      0x1b,
      0x7f,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff, // highest
      0x03,
      0x03, // figures 3
      0x09,
      0x19,
      0xd8,
      0x00, // counts_len 55296
      0x0a,
      0x84,
      0x01,
      0x01,
      0x18,
      0xe7,
      0x02, // [1, 1, 231, 2]
    ]);
    // when
    const { histogram, header } = fromNodeExport(data);
    // then
    expect(header.highest).toBe(Number.MAX_SAFE_INTEGER);
    expect(header.countsLen).toBe(55296);
    expect(histogram.totalCount).toBe(3);
    expect(histogram.getValueAtPercentile(100)).toBe(232);
  });

  it("should reject an occupied bucket beyond the clamped layout", () => {
    const data = Uint8Array.from([
      0xa5, // map(5)
      0x00,
      0x02, // version 2
      0x02,
      0x1b,
      0x7f,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff, // highest
      0x03,
      0x03, // figures 3
      0x09,
      0x19,
      0xd8,
      0x00, // counts_len 55296
      0x0a,
      0x82,
      0x19,
      0xc3,
      0x50,
      0x01, // one count at index 50000
    ]);
    expect(() => fromNodeExport(data)).toThrow(
      "counts index 50000 out of range",
    );
  });

  it("should reject a counts array length mismatch when nothing was clamped", () => {
    const data = Uint8Array.from([
      0xa4, // map(4)
      0x00,
      0x02, // version 2
      0x02,
      0x19,
      0x07,
      0xd0, // highest 2000
      0x03,
      0x03, // figures 3
      0x09,
      0x19,
      0xd8,
      0x00, // counts_len 55296, nonsense for this layout
    ]);
    expect(() => fromNodeExport(data)).toThrow("counts array length mismatch");
  });

  it("should round trip through a packed histogram", () => {
    // given
    const reference = buildJsHistogram();
    reference.recordValueWithCount(1500, 100);
    reference.recordValueWithCount(9000000, 3);
    // when
    const { histogram } = fromNodeExport(toNodeExport(reference), {
      bitBucketSize: "packed",
    });
    // then the bucket contents are identical
    const original = decodeNodeExport(toNodeExport(reference));
    const roundTripped = decodeNodeExport(toNodeExport(histogram));
    expect(roundTripped.indices).toStrictEqual(original.indices);
    expect(roundTripped.counts).toStrictEqual(original.counts);
    expect(histogram.totalCount).toBe(reference.totalCount);
  });

  it("should refuse to export something that is not a histogram", () => {
    expect(() => toNodeExport({} as any)).toThrow(
      "toNodeExport requires an hdr-histogram-js histogram",
    );
  });

  it("should reject truncated data", () => {
    const data = toNodeExport(buildJsHistogram());
    expect(() => decodeNodeExport(data.subarray(0, 5))).toThrow(
      "truncated CBOR",
    );
  });
});

describe("Node.js native histogram interop with WebAssembly histograms", () => {
  beforeAll(initWebAssembly);

  const buildWasmHistogram = (bitBucketSize: 32 | "packed" = 32) =>
    build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: Number.MAX_SAFE_INTEGER,
      numberOfSignificantValueDigits: 3,
      bitBucketSize,
      autoResize: false,
      useWebAssembly: true,
    }) as WasmHistogram;

  it("should export the same bytes as an equivalent JS histogram", () => {
    // given
    const values = [1, 42, 1000, 123456, 98765432100];
    const wasmHistogram = buildWasmHistogram();
    const reference = buildJsHistogram();
    values.forEach((value) => {
      wasmHistogram.recordValue(value);
      reference.recordValue(value);
    });
    // when then
    expect(toNodeExport(wasmHistogram)).toStrictEqual(toNodeExport(reference));
    wasmHistogram.destroy();
  });

  it("should round trip a WASM histogram", () => {
    // given
    const wasmHistogram = buildWasmHistogram();
    wasmHistogram.recordValueWithCount(1500, 100);
    wasmHistogram.recordValueWithCount(9000000, 3);
    // when
    const { histogram } = fromNodeExport(toNodeExport(wasmHistogram));
    // then
    expect(histogram.totalCount).toBe(103);
    [50, 99, 100].forEach((percentile) => {
      expect(histogram.getValueAtPercentile(percentile)).toBe(
        wasmHistogram.getValueAtPercentile(percentile),
      );
    });
    wasmHistogram.destroy();
  });

  it("should export a packed WASM histogram", () => {
    // given
    const wasmHistogram = buildWasmHistogram("packed");
    const reference = buildJsHistogram();
    [25, 3000, 777777777].forEach((value) => {
      wasmHistogram.recordValue(value);
      reference.recordValue(value);
    });
    // when then
    expect(toNodeExport(wasmHistogram)).toStrictEqual(toNodeExport(reference));
    wasmHistogram.destroy();
  });

  it("should clamp the 2^64-1 min of an empty WASM histogram", () => {
    // given
    const wasmHistogram = buildWasmHistogram();
    // when
    const { header } = decodeNodeExport(toNodeExport(wasmHistogram));
    // then
    expect(header.min).toBe(Number.MAX_SAFE_INTEGER);
    expect(header.totalCount).toBe(0);
    const { histogram } = fromNodeExport(toNodeExport(wasmHistogram));
    expect(histogram.totalCount).toBe(0);
    wasmHistogram.destroy();
  });
});
