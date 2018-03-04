import "core-js";
import { expect } from "chai";
import * as jsc from "jsverify";
import ByteBuffer from "./ByteBuffer";
import ZigZagEncoding from "./ZigZagEncoding";

const runFromStryker = __dirname.includes("stryker");

const checkOptions = {
  tests: runFromStryker ? 10 : 1000
};

describe("Zig Zag Encoding", () => {
  it("should get the same number after an encoding & decoding", () => {
    const buffer = ByteBuffer.allocate(8);
    const property = jsc.check(
      jsc.forall(jsc.nat(Number.MAX_SAFE_INTEGER), number => {
        buffer.resetPosition();
        ZigZagEncoding.encode(buffer, number);
        buffer.resetPosition();
        const result = ZigZagEncoding.decode(buffer);
        return number === result;
      }),
      checkOptions
    );

    expect(property).to.be.true;
  });
});
