/*
 * This is a TypeScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const ulp = (x: number) => Math.pow(2, Math.floor(Math.log2(x)) - 52);

export default ulp;
