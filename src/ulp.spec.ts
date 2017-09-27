import { expect } from "chai";
import ulp from "./ulp";

describe("math ulp helper", () => {
  it("should compute ulp of integer", () => {
    expect(ulp(1)).equals(2.220446049250313e-16);
  });

  it("should compute ulp of floating point number", () => {
    expect(ulp(0.000333)).equals(5.421010862427522e-20);
  });
});
