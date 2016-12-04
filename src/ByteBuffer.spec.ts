import "core-js"
import { expect } from "chai";
import ByteBuffer from "./ByteBuffer"; 

describe('ByteBuffer', () => {
  
  it("should put value moving the index", () => {
      // given
      const buffer = new ByteBuffer(8);
      // when
      buffer.put(123);
      // then
      expect(buffer.data[0]).to.be.equal(123);
      expect(buffer.index).to.be.equal(1);
  });

  it("should resize when values overflow ", () => {
      // given
      const buffer = new ByteBuffer(1);
      buffer.put(123);
      // when
      buffer.put(42);
      // then
      expect(buffer.data[0]).to.be.equal(123);
      expect(buffer.data[1]).to.be.equal(42);
  });

  it("should get value moving the index", () => {
      // given
      const buffer = new ByteBuffer(8);
      buffer.put(123);
      buffer.resetIndex();
      // when
      const value = buffer.get();
      // then
      expect(value).to.be.equal(123);
      expect(buffer.index).to.be.equal(1);
  });


});