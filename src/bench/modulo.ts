import { Suite } from "benchmark";

const suite = new Suite("modulo");

let someInteger = 0;

suite
  .add(
    "%",
    () => {
      someInteger % 256;
    },
    {
      setup: () => {
        someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      }
    }
  )
  .add(
    "&",
    () => {
      someInteger & 0xff;
    },
    {
      setup: () => {
        someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      }
    }
  )
  .on("complete", function() {
    console.log("Fastest is " + this.filter("fastest").map("name"));
    console.log({ result: this });
  })
  .run({
    onCycle: () => {
      console.log("eeeeee");
    }
  });
