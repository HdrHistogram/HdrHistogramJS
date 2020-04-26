import { Histogram8 } from "../Histogram";

const buildHistogram = (): Histogram8 =>
  new Histogram8(
    1,
    9007199254740991, // Number.MAX_SAFE_INTEGER
    3
  );

describe("BENCH", () => {
  it("should compute mean value", () => {
    // given
    const histogram = buildHistogram();
    // when
    for (let index = 0; index < 1000000000; index++) {
      histogram.recordValue(index);
    }
  });
});
