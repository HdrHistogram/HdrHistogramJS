import * as fc from "fast-check";
import ByteBuffer from "./ByteBuffer";
import ZigZagEncoding from "./ZigZagEncoding";

const runFromStryker = __dirname.includes("stryker");

const runnerOptions = {
  numRuns: runFromStryker ? 10 : 1000,
};

describe("Zig Zag Encoding", () => {
  it("should get the same number after an encoding & decoding", () => {
    const buffer = ByteBuffer.allocate(8);
    fc.assert(
      fc.property(fc.nat(Number.MAX_SAFE_INTEGER), (number) => {
        buffer.resetPosition();
        ZigZagEncoding.encode(buffer, number);
        buffer.resetPosition();
        const result = ZigZagEncoding.decode(buffer);
        return number === result;
      }),
      runnerOptions
    );
  });
});
