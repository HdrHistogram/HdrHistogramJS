describe("assemblyscript bug", () => {
  xit("should not crash", () => {
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
