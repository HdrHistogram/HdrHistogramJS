import b from "benny";
import { build } from "../index";
import {
  encodeIntoCompressedBase64,
  decodeFromCompressedBase64
} from "../encoding";
import { initWebAssembly } from "../wasm";
initWebAssembly().then(() => {
  const randomInteger = (max: number = Number.MAX_SAFE_INTEGER) =>
    Math.floor(Math.random() * max);
  const options = { initCount: 1000 };

  b.suite(
    "Histogram decoding",
    b.add(
      "Int32Histogram",
      () => {
        const histogram = build();
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        const b64 = encodeIntoCompressedBase64(histogram);
        return () => {
          decodeFromCompressedBase64(b64, 32, false).destroy();
        };
      },
      options
    ),

    b.add(
      "WASM 32B Histogram",
      () => {
        const histogram = build();
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        const b64 = encodeIntoCompressedBase64(histogram);
        histogram.destroy();
        return () => {
          decodeFromCompressedBase64(b64, 32, true).destroy();
        };
      },
      options
    ),
    b.add(
      "Packed Histogram",
      () => {
        const histogram = build();
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        const b64 = encodeIntoCompressedBase64(histogram);
        return () => {
          decodeFromCompressedBase64(b64, "packed", false).destroy();
        };
      },
      options
    ),
    b.add(
      "WASM Packed Histogram",
      () => {
        const histogram = build({
          bitBucketSize: "packed",
          useWebAssembly: true
        });
        for (let index = 0; index < 1024; index++) {
          histogram.recordValueWithCount(randomInteger(), randomInteger(100));
        }
        const b64 = encodeIntoCompressedBase64(histogram);
        histogram.destroy();
        return () => {
          decodeFromCompressedBase64(b64, "packed", true).destroy();
        };
      },
      options
    ),

    b.complete(),
    b.save({ file: "decoding", format: "chart.html" })
  );
});
