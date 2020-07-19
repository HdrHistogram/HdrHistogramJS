const leftPadding = (size: number) => {
  return (input: string) => {
    if (input.length < size) {
      return " ".repeat(size - input.length) + input;
    }
    return input;
  };
};

export const integerFormatter = (size: number) => {
  const padding = leftPadding(size);
  return (integer: number) => padding("" + integer);
};

const { floor, log10, pow } = Math;
const numberOfDigits = (n: number) => floor(log10(n) + 1);

export const keepSignificantDigits = (digits: number) => (value: number) => {
  const valueDigits = numberOfDigits(value);
  if (valueDigits > digits) {
    const extraDigits = valueDigits - digits;
    const magnitude = pow(10, extraDigits);
    return value - (value % magnitude);
  }
  return value;
};

export const floatFormatter = (size: number, fractionDigits: number) => {
  const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    useGrouping: false,
  });

  const padding = leftPadding(size);

  return (float: number) => padding(numberFormatter.format(float));
};
