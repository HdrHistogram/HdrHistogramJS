

class ByteBuffer {

  index: number;

  data: Uint8Array;

  constructor(size: number) {
    this.index = 0;
    this.data = new Uint8Array(size);
  }

  put(value: number) {
    if (this.index === this.data.length) {
      const oldArray = this.data;
      this.data = new Uint8Array(this.data.length * 2);
      this.data.set(oldArray);
    }
    this.data[this.index] = value;
    this.index++;
  }

  get(): number {
    const value = this.data[this.index];
    this.index++;
    return value;
  }

  resetIndex() {
    this.index = 0;
  }

} 

export default ByteBuffer