import { WasmHistogram } from "../wasm";

/*const histogram = WasmHistogram.create(1, 2, 3, 32, true);
histogram.recordValue(123456);
histogram.recordValue(122777);
histogram.recordValue(127);
histogram.recordValue(42);

console.log(histogram.outputPercentileDistribution());

//histogram.destroy();

console.log("before XX");
const histogram2 = histogram.copyCorrectedForCoordinatedOmission(100);
console.log("after XXX");
console.log(histogram2.outputPercentileDistribution());*/

console.log("=======================================");

const h1 = WasmHistogram.build();
h1.recordValue(123);

console.log(h1.outputPercentileDistribution());

const h2 = WasmHistogram.build();
h2.recordValue(10000);
h2.recordValue(10000);
h2.recordValue(10000);
h2.recordValue(10000);
h2.recordValue(10000);
h2.recordValue(10002);
h2.recordValue(10003);

h1.add(h2);
console.log("=======================================");
console.log(h1.outputPercentileDistribution());
console.log("=======================================");

h1.subtract(h2);

console.log("=======================================");
console.log(h1.outputPercentileDistribution());
console.log("=======================================");

const h3 = WasmHistogram.build({ autoResize: false });
h3.autoResize = true;
console.log(h3.autoResize);
