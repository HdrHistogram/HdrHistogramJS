import { build, BuildRequest, Histogram } from "../index";

const randomInteger = (max: number = Number.MAX_SAFE_INTEGER) =>
  Math.floor(Math.random() * max);

export const buildFilledHistogram = (
  request: BuildRequest = {},
  valueCount = 1024
): Histogram => {
  const histogram = build(request);
  for (let index = 0; index < valueCount; index++) {
    histogram.recordValueWithCount(randomInteger(), randomInteger(100));
  }
  return histogram;
};
