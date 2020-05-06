import { decodeFromByteBuffer, encodeIntoByteBuffer } from "../encoding";
import { Histogram32 } from "../Histogram";
import ByteBuffer from "../ByteBuffer";

describe("Histogram encoding", () => {
  it("should encode filling a byte buffer", () => {
    // given
    const histogram = new Histogram32(1, 9007199254740991, 2);
    histogram.recordValue(42);
    const buffer = ByteBuffer.allocate();
    // when
    const encodedSize = encodeIntoByteBuffer<Uint32Array, u32>(
      histogram,
      buffer
    );
    // then
    expect(encodedSize).toBe(42);
  });

  it("should decode reading a byte buffer", () => {
    // given
    const histogram = new Histogram32(1, 9007199254740991, 2);
    histogram.recordValue(42);
    histogram.recordValue(7);
    histogram.recordValue(77);
    const buffer = ByteBuffer.allocate();
    const encodedSize = encodeIntoByteBuffer<Uint32Array, u32>(
      histogram,
      buffer
    );
    buffer.position = 0;
    // when
    const result = decodeFromByteBuffer<Uint32Array, u32>(buffer, 0);
    // then
    expect(result.outputPercentileDistribution()).toBe(
      histogram.outputPercentileDistribution()
    );
  });
});
