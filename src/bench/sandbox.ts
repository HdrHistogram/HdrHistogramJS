import { WasmHistogram } from "../wasm";

const histogram = WasmHistogram.create(1, 2, 3, 32, true);
histogram.recordValue(123456);
histogram.recordValue(122777);
histogram.recordValue(127);
histogram.recordValue(42);

console.log(histogram.outputPercentileDistribution());

//histogram.destroy();

console.log("before");
const h2 = histogram.copyCorrectedForCoordinatedOmission(100);
console.log("after");
console.log(h2.outputPercentileDistribution());


