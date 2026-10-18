/*
 * Interoperability with Node.js native histograms (node:perf_hooks).
 *
 * Node's histogram.export() (Node >= 26.9) returns one CBOR (RFC 8949) map
 * with small unsigned-integer keys, written by a hand-rolled encoder in
 * Histogram::Export (src/histogram.cc). The format is Node's own, not an
 * HdrHistogram standard. Both libraries derive the exact same counts array
 * layout from (lowest, highest, figures), so a counts index written by Node
 * means the same bucket here.
 *
 * Map keys: 0 version (currently 2), 1 lowest discernible value, 2 highest
 * trackable value, 3 significant figures, 4 total count, 5 min value,
 * 6 max value, 7 normalizing index offset (always 0 in Node), 8 conversion
 * ratio (float64, always 1.0 in Node), 9 counts array length, 10 sparse
 * counts (array of [index delta, count, ...] pairs), 11 EWMA sub-map
 * (only when alpha > 0; its keys: 0 alpha, 1 mean, 2 variance, 3 error
 * rate - all float64 - and 4 threshold, uint).
 *
 * Version 2 data may omit any field and may carry unknown keys, which are
 * skipped. Version 1 data (or data with no version key) keeps the original
 * strict semantics: an unknown key is an error.
 */
import type Histogram from "./Histogram";
import type { BitBucketSize } from "./Histogram";
import JsHistogram from "./JsHistogram";
import { WasmHistogram } from "./wasm";
import { build } from "./HistogramBuilder";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * The EWMA state Node keeps outside HdrHistogram, carried by key 11 of the
 * export when the native histogram was created with a halfLife.
 * Alpha is 1 - 2^(-1/halfLife); the half-life itself is not stored.
 */
export interface NodeHistogramEwma {
  alpha: number;
  mean: number;
  variance: number;
  errorRate: number;
  threshold: number;
}

/**
 * The scalar fields of a Node histogram export. totalCount, min and max are
 * -1 when the export omitted them (allowed in version 2); negative values
 * are impossible in the format. highest, min and max above 2^53 - 1 (e.g.
 * the 2^63 - 1 default of native histograms) are clamped to 2^53 - 1.
 */
export interface NodeExportHeader {
  version: number;
  lowest: number;
  highest: number;
  figures: 1 | 2 | 3 | 4 | 5;
  totalCount: number;
  min: number;
  max: number;
  normalizingIndexOffset: number;
  conversionRatio: number;
  countsLen: number;
  ewma?: NodeHistogramEwma;
}

export interface NodeExport {
  header: NodeExportHeader;
  /** Absolute counts array indices of the occupied buckets, ascending. */
  indices: Uint32Array;
  /** The count at each index (exact up to 2^53). */
  counts: Float64Array;
}

export interface FromNodeExportOptions {
  /**
   * Backing storage of the returned histogram. Default is 64
   * (Float64-backed, exact counts up to 2^53, like the native source);
   * pass 32 or 'packed' to save memory when counts are known to be small.
   */
  bitBucketSize?: BitBucketSize;
}

const MAX_SKIP_DEPTH = 16;

/**
 * Just enough RFC 8949 to read what Node writes: unsigned integers,
 * float64, array and map headers, and skipping of unknown items.
 */
class CborReader {
  private p = 0;

  constructor(private b: Uint8Array) {}

  private view(): DataView {
    return new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
  }

  /**
   * Reads one initial byte and its argument. The top three bits are the
   * major type, the low five bits say where the argument is. An 8-byte
   * argument is returned as a bigint so the caller decides between
   * throwing and clamping.
   */
  private head(): { major: number; value: number | bigint } {
    if (this.p >= this.b.length) {
      throw new RangeError("truncated CBOR");
    }
    const initial = this.b[this.p];
    this.p++;
    const major = initial >> 5;
    const ai = initial & 0x1f;
    let value: number | bigint;
    if (ai < 24) {
      value = ai;
    } else if (ai === 24) {
      value = this.b[this.p];
      this.p += 1;
    } else if (ai === 25) {
      value = this.view().getUint16(this.p);
      this.p += 2;
    } else if (ai === 26) {
      value = this.view().getUint32(this.p);
      this.p += 4;
    } else if (ai === 27) {
      const big = this.view().getBigUint64(this.p);
      this.p += 8;
      value = big <= BigInt(MAX_SAFE) ? Number(big) : big;
    } else {
      throw new RangeError(`unsupported CBOR additional info ${ai}`);
    }
    if (this.p > this.b.length) {
      throw new RangeError("truncated CBOR");
    }
    return { major, value };
  }

  uint(): number {
    const { major, value } = this.head();
    if (major !== 0) {
      throw new TypeError(`expected uint, got major type ${major}`);
    }
    if (typeof value === "bigint") {
      throw new RangeError("integer exceeds 2^53");
    }
    return value;
  }

  /** An unsigned integer, with values above 2^53 - 1 clamped to 2^53 - 1. */
  uintClamped(): number {
    const { major, value } = this.head();
    if (major !== 0) {
      throw new TypeError(`expected uint, got major type ${major}`);
    }
    return typeof value === "bigint" ? MAX_SAFE : value;
  }

  arrayLength(): number {
    const { major, value } = this.head();
    if (major !== 4) {
      throw new TypeError(`expected array, got major type ${major}`);
    }
    if (typeof value === "bigint") {
      throw new RangeError("integer exceeds 2^53");
    }
    return value;
  }

  mapLength(): number {
    const { major, value } = this.head();
    if (major !== 5) {
      throw new TypeError(`expected map, got major type ${major}`);
    }
    if (typeof value === "bigint") {
      throw new RangeError("integer exceeds 2^53");
    }
    return value;
  }

  /** A float64 (how Node writes ratios and EWMA fields) or a uint. */
  number(): number {
    if (this.p < this.b.length && this.b[this.p] === 0xfb) {
      if (this.p + 9 > this.b.length) {
        throw new RangeError("truncated CBOR");
      }
      const value = this.view().getFloat64(this.p + 1);
      this.p += 9;
      return value;
    }
    return this.uint();
  }

  /** Consumes one complete data item of any major type. */
  skip(depth = 0): void {
    if (depth > MAX_SKIP_DEPTH) {
      throw new RangeError("CBOR nesting too deep");
    }
    // float64 before head(): head() would read ai = 27 as an 8-byte
    // integer, which consumes the same bytes but is semantically wrong.
    if (this.p < this.b.length && this.b[this.p] === 0xfb) {
      this.number();
      return;
    }
    const { major, value } = this.head();
    if (typeof value === "bigint") {
      return; // major 0 or 1; the argument was the value
    }
    switch (major) {
      case 0:
      case 1:
        break;
      case 2:
      case 3:
        this.p += value;
        if (this.p > this.b.length) {
          throw new RangeError("truncated CBOR");
        }
        break;
      case 4:
        for (let i = 0; i < value; i++) {
          this.skip(depth + 1);
        }
        break;
      case 5:
        for (let i = 0; i < 2 * value; i++) {
          this.skip(depth + 1);
        }
        break;
      case 6:
        this.skip(depth + 1);
        break;
      default:
        // major 7 other than float64: head() already consumed the bytes
        break;
    }
  }
}

const decodeEwma = (reader: CborReader): NodeHistogramEwma => {
  const ewma: NodeHistogramEwma = {
    alpha: 0,
    mean: 0,
    variance: 0,
    errorRate: 0,
    threshold: 0,
  };
  const pairs = reader.mapLength();
  for (let i = 0; i < pairs; i++) {
    const key = reader.uint();
    switch (key) {
      case 0:
        ewma.alpha = reader.number();
        break;
      case 1:
        ewma.mean = reader.number();
        break;
      case 2:
        ewma.variance = reader.number();
        break;
      case 3:
        ewma.errorRate = reader.number();
        break;
      case 4:
        ewma.threshold = reader.uint();
        break;
      default:
        reader.skip();
    }
  }
  return ewma;
};

/**
 * Parses the bytes returned by a native Node.js histogram.export() into a
 * header plus two parallel typed arrays, without building a histogram.
 * Useful to inspect an export or read the EWMA state cheaply.
 */
export const decodeNodeExport = (data: Uint8Array): NodeExport => {
  const reader = new CborReader(data);
  // Same defaults as Node's Histogram::Import. Version defaults to 1
  // deliberately: Node treats data with no version key as version 1, and a
  // version-2 export always carries key 0 first.
  const header: NodeExportHeader = {
    version: 1,
    lowest: 1,
    highest: MAX_SAFE,
    figures: 3,
    totalCount: -1,
    min: -1,
    max: -1,
    normalizingIndexOffset: 0,
    conversionRatio: 1,
    countsLen: 0,
  };
  let indices = new Uint32Array(0);
  let counts = new Float64Array(0);

  const pairs = reader.mapLength();
  for (let i = 0; i < pairs; i++) {
    const key = reader.uint();
    switch (key) {
      case 0:
        header.version = reader.uint();
        break;
      case 1:
        header.lowest = reader.uint();
        break;
      case 2:
        header.highest = reader.uintClamped();
        break;
      case 3:
        header.figures = reader.uint() as 1 | 2 | 3 | 4 | 5;
        break;
      case 4:
        header.totalCount = reader.uint();
        break;
      case 5:
        header.min = reader.uintClamped();
        break;
      case 6:
        header.max = reader.uintClamped();
        break;
      case 7:
        header.normalizingIndexOffset = reader.uint();
        break;
      case 8:
        header.conversionRatio = reader.number();
        break;
      case 9:
        header.countsLen = reader.uint();
        break;
      case 10: {
        const length = reader.arrayLength();
        if (length % 2 !== 0) {
          throw new RangeError("sparse counts array must have even length");
        }
        const bucketCount = length / 2;
        indices = new Uint32Array(bucketCount);
        counts = new Float64Array(bucketCount);
        let index = 0;
        for (let k = 0; k < bucketCount; k++) {
          index += reader.uint();
          indices[k] = index;
          counts[k] = reader.uint();
        }
        break;
      }
      case 11:
        header.ewma = decodeEwma(reader);
        break;
      default:
        if (header.version < 2) {
          throw new TypeError(
            `unknown key ${key} in version 1 histogram export`,
          );
        }
        reader.skip();
    }
  }
  return { header, indices, counts };
};

/**
 * Builds an hdr-histogram-js histogram from the bytes returned by a native
 * Node.js histogram.export() (Node >= 26.9). Cost is proportional to the
 * number of occupied buckets. Returns the histogram and the decoded header,
 * which carries the state Node keeps outside HdrHistogram (EWMA fields).
 *
 * A native highest trackable value above 2^53 - 1 (the 2^63 - 1 default)
 * is clamped to 2^53 - 1; the import then fails only if an occupied bucket
 * lies beyond the clamped range, which no real latency ever reaches.
 */
export const fromNodeExport = (
  data: Uint8Array,
  options?: FromNodeExportOptions,
): { histogram: Histogram; header: NodeExportHeader } => {
  const { header, indices, counts } = decodeNodeExport(data);
  if (header.normalizingIndexOffset !== 0) {
    throw new RangeError("normalizing index offset != 0 is not supported");
  }
  // autoResize false so the layout stays exactly what Node had; no
  // WebAssembly because WasmHistogram does not expose index-level writes.
  const histogram = build({
    lowestDiscernibleValue: header.lowest,
    highestTrackableValue: header.highest,
    numberOfSignificantValueDigits: header.figures,
    bitBucketSize: options?.bitBucketSize ?? 64,
    autoResize: false,
    useWebAssembly: false,
  }) as JsHistogram;

  // For the same (lowest, highest, figures) both libraries derive the same
  // counts array length; any derivation difference shows up here first. A
  // longer native array is accepted only for a clamped highest, where the
  // extra buckets cover the range above 2^53 - 1.
  const length = histogram.countsArrayLength;
  const clamped = header.highest === MAX_SAFE && header.countsLen > length;
  if (header.countsLen !== length && !clamped) {
    throw new RangeError(
      `counts array length mismatch: Node wrote ${header.countsLen}, local layout has ${length}`,
    );
  }

  let total = 0;
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    // A corrupt delta could run past the array; the typed array would
    // otherwise ignore the write silently.
    if (index >= length) {
      throw new RangeError(`counts index ${index} out of range`);
    }
    histogram.addToCountAtIndex(index, counts[i]);
    total += counts[i];
  }
  // addToCountAtIndex is a raw write; repair the derived fields by hand.
  // Bucket edges are what Node's own min/max getters report too.
  histogram.setTotalCount(total);
  if (indices.length > 0) {
    histogram.maxValue = histogram.highestEquivalentValue(
      histogram.valueFromIndex(indices[indices.length - 1]),
    );
    histogram.minNonZeroValue = histogram.lowestEquivalentValue(
      histogram.valueFromIndex(indices[0]),
    );
  }
  if (header.totalCount >= 0 && header.totalCount !== total) {
    throw new RangeError(
      `total count mismatch: expected ${header.totalCount}, decoded ${total}`,
    );
  }
  return { histogram, header };
};

/** Chooses the shortest CBOR argument form, exactly as Node's CborWriteUint. */
const cborUint = (out: number[], major: number, value: number) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`cannot encode ${value} as a CBOR uint`);
  }
  const base = major << 5;
  if (value < 24) {
    out.push(base | value);
  } else if (value < 0x100) {
    out.push(base | 24, value);
  } else if (value < 0x10000) {
    out.push(base | 25, value >>> 8, value & 0xff);
  } else if (value < 0x100000000) {
    out.push(
      base | 26,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  } else {
    const hi = Math.floor(value / 0x100000000);
    const lo = value % 0x100000000;
    out.push(
      base | 27,
      (hi >>> 24) & 0xff,
      (hi >>> 16) & 0xff,
      (hi >>> 8) & 0xff,
      hi & 0xff,
      (lo >>> 24) & 0xff,
      (lo >>> 16) & 0xff,
      (lo >>> 8) & 0xff,
      lo & 0xff,
    );
  }
};

const cborF64 = (out: number[], value: number) => {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value);
  out.push(0xfb);
  for (let i = 0; i < 8; i++) {
    out.push(buffer.getUint8(i));
  }
};

/**
 * Mirrors Node's Histogram::Export byte for byte, with an optional EWMA
 * sub-map so tests can exercise the key 11 decoding path.
 * @internal
 */
export const encodeNodeExport = (
  histogram: Histogram,
  ewma?: NodeHistogramEwma,
): Uint8Array => {
  // The occupied buckets as interleaved [index, count, ...] pairs. A WASM
  // histogram hands them over in one boundary crossing; a JS histogram is
  // walked index by index.
  let lowestDiscernibleValue: number;
  let countsArrayLength: number;
  let nonZeroCounts: ArrayLike<number>;
  if (histogram instanceof JsHistogram) {
    lowestDiscernibleValue = histogram.lowestDiscernibleValue;
    countsArrayLength = histogram.countsArrayLength;
    const pairs: number[] = [];
    for (let i = 0; i < countsArrayLength; i++) {
      const count = histogram.getCountAtIndex(i);
      if (count !== 0) {
        pairs.push(i, count);
      }
    }
    nonZeroCounts = pairs;
  } else if (histogram instanceof WasmHistogram) {
    lowestDiscernibleValue = histogram.lowestDiscernibleValue;
    countsArrayLength = histogram.countsArrayLength;
    nonZeroCounts = histogram.getNonZeroCounts();
  } else {
    throw new TypeError(
      "toNodeExport requires an hdr-histogram-js histogram (JS or WebAssembly)",
    );
  }

  const out: number[] = [];
  cborUint(out, 5, ewma ? 12 : 11);
  cborUint(out, 0, 0);
  cborUint(out, 0, 2); // format version
  cborUint(out, 0, 1);
  cborUint(out, 0, lowestDiscernibleValue);
  cborUint(out, 0, 2);
  cborUint(out, 0, histogram.highestTrackableValue);
  cborUint(out, 0, 3);
  cborUint(out, 0, histogram.numberOfSignificantValueDigits);
  cborUint(out, 0, 4);
  cborUint(out, 0, histogram.totalCount);
  cborUint(out, 0, 5);
  // 2^64 - 1 on an empty WASM histogram; clamp like the import direction
  cborUint(out, 0, Math.min(histogram.minNonZeroValue, MAX_SAFE));
  cborUint(out, 0, 6);
  cborUint(out, 0, Math.min(histogram.maxValue, MAX_SAFE));
  cborUint(out, 0, 7);
  cborUint(out, 0, 0); // normalizing index offset
  cborUint(out, 0, 8);
  cborF64(out, 1); // conversion ratio
  cborUint(out, 0, 9);
  cborUint(out, 0, countsArrayLength);
  cborUint(out, 0, 10);
  cborUint(out, 4, nonZeroCounts.length);
  let previous = 0;
  for (let k = 0; k < nonZeroCounts.length; k += 2) {
    const index = nonZeroCounts[k];
    cborUint(out, 0, index - previous);
    cborUint(out, 0, nonZeroCounts[k + 1]);
    previous = index;
  }
  if (ewma) {
    cborUint(out, 0, 11);
    cborUint(out, 5, 5);
    cborUint(out, 0, 0);
    cborF64(out, ewma.alpha);
    cborUint(out, 0, 1);
    cborF64(out, ewma.mean);
    cborUint(out, 0, 2);
    cborF64(out, ewma.variance);
    cborUint(out, 0, 3);
    cborF64(out, ewma.errorRate);
    cborUint(out, 0, 4);
    cborUint(out, 0, ewma.threshold);
  }
  return Uint8Array.from(out);
};

/**
 * Serializes an hdr-histogram-js histogram (JS or WebAssembly backed) into
 * the bytes that Node.js's perf_hooks.importHistogram() (Node >= 26.9)
 * accepts: a version 2 export with keys 0 to 10. EWMA state (key 11) is
 * never written, since hdr-histogram-js keeps none.
 */
export const toNodeExport = (histogram: Histogram): Uint8Array =>
  encodeNodeExport(histogram);
