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

export const floatFormatter = (size: number, fractionDigits: number) => {
  const numberFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    useGrouping: false
  });

  const padding = leftPadding(size);

  return (float: number) => padding(numberFormatter.format(float));
};
