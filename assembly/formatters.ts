/*
 * This is a AssemblyScript port of the original Java version, which was written by
 * Gil Tene as described in
 * https://github.com/HdrHistogram/HdrHistogram
 * and released to the public domain, as explained at
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const leftPadding = (size: i32, input: string): string => {
  if (input.length < size) {
    input.padStart(size - input.length);
    return " ".repeat(size - input.length) + input;
  }
  return input;
};

export const integerFormatter = (size: i32, integer: u64): string => {
  return leftPadding(size, integer.toString());
};

export class IntegerFormatter {
  constructor(private size: i32) {}

  format(integer: u64): string {
    return leftPadding(this.size, integer.toString());
  }
}

export class FloatFormatter {
  constructor(private size: i32, private fractionDigits: i32) {}

  format(float: f64): string {
    const intergerPart = <u64>Math.floor(float);
    const digits = Math.pow(10, this.fractionDigits);
    const floatPart = <u64>(
      Math.round(float * digits - <f64>intergerPart * digits)
    );
    let floatPartString = floatPart.toString();
    if (floatPartString.length < this.fractionDigits) {
      floatPartString += "0".repeat(
        this.fractionDigits - floatPartString.length
      );
    }

    let result = intergerPart.toString() + "." + floatPartString;
    if (result.length < this.size) {
      result = " ".repeat(this.size - result.length) + result;
    }
    return result;
  }
}
