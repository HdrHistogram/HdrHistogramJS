import ulp from "../ulp";

describe("math ulp helper", () => {
  it("should compute ulp of integer", () => {
    expect<f64>(ulp(1)).toBe(2.220446049250313e-16);
  });

  it("should compute ulp of floating point number", () => {
    expect<f64>(ulp(0.000333)).toBe(5.421010862427522e-20);
  });
});
