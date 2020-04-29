import { WasmHistogram } from "../wasm";

const histogram = new WasmHistogram(1, 2, 3, 32, false);
histogram.recordValue(123456);
histogram.recordValue(122777);
histogram.recordValue(127);
histogram.recordValue(42);

console.log(histogram.outputPercentileDistribution());
