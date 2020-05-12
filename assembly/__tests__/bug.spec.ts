import { decodeFromByteBuffer, encodeIntoByteBuffer } from "../encoding";
import { Histogram32 } from "../Histogram";
import ByteBuffer from "../ByteBuffer";

describe("bug loop", () => {
  it("should ", () => {
    const nbLoop = 14828;
    let index: i32 = 0;
    let count = Math.abs(index++);
    for (let i = 0; i < nbLoop; i++) {
      count = Math.abs(index++);
      if (count < 0) {
        throw new Error("blabla, should never happen" + count.toString());
      }
    }
  });
});
