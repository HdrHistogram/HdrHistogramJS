import { Suite } from "benchmark";

const suite = new Suite("division");

let someInteger = 0;

suite
  .on(
    "start",
    () => (someInteger = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
  )
  .add("%", () => {
    someInteger % 16;
  })
  .add("&", () => {
    someInteger & 0xf;
  })
  .on("complete", function() {
    console.log("Fastest is " + this.filter("fastest").map("name"));
    console.log({ result: this });
  })
  .run();
