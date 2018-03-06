/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */
import "core-js";
import { expect } from "chai";
import {
  Int32Histogram,
  ByteBuffer,
  AbstractHistogram,
  decodeFromCompressedBase64,
  encodeIntoBase64String
} from "./index";

describe("Histogram encoding", () => {
  it("should encode filling a byte buffer", () => {
    // given
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.recordValue(42);
    const buffer = ByteBuffer.allocate();
    // when
    const encodedSize = histogram.encodeIntoByteBuffer(buffer);
    // then
    expect(encodedSize).to.be.equal(42);
  });

  it("should decode reading a byte buffer", () => {
    // given
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 2);
    histogram.recordValue(42);
    histogram.recordValue(7);
    histogram.recordValue(77);
    const buffer = ByteBuffer.allocate();
    const encodedSize = histogram.encodeIntoByteBuffer(buffer);
    buffer.position = 0;
    // when
    const result = AbstractHistogram.decodeFromByteBuffer(
      buffer,
      Int32Histogram,
      0
    );
    // then
    expect(result.outputPercentileDistribution()).to.be.equal(
      histogram.outputPercentileDistribution()
    );
  });

  it("should decode and decompress reading a byte buffer", () => {
    // given
    const base64 = require("base64-js");
    const buffer = new ByteBuffer(
      base64.toByteArray(
        "HISTFAAAACB42pNpmSzMwMDAxAABMJqRQf4/GNh/gAgEMwEAkp4I6Q=="
      )
    );
    // when
    const histogram = AbstractHistogram.decodeFromCompressedByteBuffer(
      buffer,
      Int32Histogram,
      0
    );
    // then
    expect(histogram.getMean()).to.be.equal(42);
    expect(histogram.getTotalCount()).to.be.equal(1);
  });

  it("should encode and compress an histogram", () => {
    // given
    const histogram = new Int32Histogram(1, Number.MAX_SAFE_INTEGER, 3);
    histogram.recordValue(32415482);
    // when
    const buffer = ByteBuffer.allocate();
    histogram.encodeIntoCompressedByteBuffer(buffer);
    // then
    buffer.resetPosition();
    const decodedHistogram = AbstractHistogram.decodeFromCompressedByteBuffer(
      buffer,
      Int32Histogram,
      0
    );
    expect(decodedHistogram.getValueAtPercentile(50)).to.be.equal(
      histogram.getValueAtPercentile(50)
    );
  });

  it("should decode and decompress reading a base64 string", () => {
    // given
    const base64String = "HISTFAAAAB542pNpmSzMwMDAxAABzFCaEUoz2X+AMIKZAEARAtM=";
    // when
    const histogram = decodeFromCompressedBase64(base64String);
    // then
    expect(histogram.getMean()).to.be.equal(42);
    expect(histogram.getTotalCount()).to.be.equal(1);
  });

  it("should decode and decompress a big base64 string", () => {
    // given
    const base64String =
      "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";
    // when
    const histogram = decodeFromCompressedBase64(base64String);
    // then
    expect(histogram.getTotalCount()).to.be.equal(10000);
  });

  it("should encode and compress an histogram to a base64 string", () => {
    // given
    const histogram = new Int32Histogram(1, 2, 3);
    histogram.recordValue(42);
    // when
    const base64Histogram = encodeIntoBase64String(histogram);
    // then
    expect(base64Histogram).to.be.equal(
      "HISTFAAAAB94nJNpmSzMwMDABMSMQMzMAAGMUJoJxg9mAgA1TQGm"
    );
  });

  it("should throw an error when trying to decompress an histogram using V1 encoding", () => {
    // given
    const base64V1EncodingString =
      "HISTIgAAAFd42pNpmazIwMAYxgABTBDKT4GBgdnNYMcCBvsPUBkeBkYGZqA8MwMbAzsDC5DFBCTZgJCDQY1BjkGLQZRBlUEPCB8zWDCYMxgDZZkZhgJgHDibAY8JB/A=";
    // when & then
    expect(() => decodeFromCompressedBase64(base64V1EncodingString)).to.throw(
      "Encoding not supported"
    );
  });
});
