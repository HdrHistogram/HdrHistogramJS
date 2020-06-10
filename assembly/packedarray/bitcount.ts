/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

export const bitCount = (n: u64): u8 => {
  let bits: u8 = 0;
  while (n !== 0) {
    const input: u32 = <u32>(n & (<u64>u32.MAX_VALUE));
    bits += bitCount32(input);
    n /= 0x100000000;
  }
  return bits;
};

function bitCount32(input: u32): u8 {
  let n = input;
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return <u8>((((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24);
}
