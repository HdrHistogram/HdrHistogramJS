import { Suite } from "benchmark";
import AbstractHistogram from "../AbstractHistogram";
import { build } from "..";
const suite = new Suite("modulo");

let histogram: AbstractHistogram;

suite
  .add(
    "Int32Histogram",
    () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    },
    {
      setup: () => {
        histogram = build({ bitBucketSize: 32 });
      }
    }
  )
  .add(
    "Float64Histogram",
    () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    },
    {
      setup: () => {
        histogram = build({ bitBucketSize: 64 });
      }
    }
  )
  .add(
    "PackedHistogram",
    () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    },
    {
      setup: () => {
        histogram = build({ bitBucketSize: "packed" });
      }
    }
  )
  .add(
    "SparseArrayHistogram",
    () => {
      const someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      histogram.recordValue(someInteger);
    },
    {
      setup: () => {
        histogram = build({ bitBucketSize: "sparse_array" });
      }
    }
  )
  .on("complete", function() {
    console.log("Fastest is " + this.filter("fastest").map("name"));
    console.log({ result: this });
  })
  .run();
