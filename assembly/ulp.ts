/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const ulp = (x: f64): f64 =>
  Math.abs(x - reinterpret<f64>(reinterpret<u64>(x) ^ 1));

export default ulp;
