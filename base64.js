const fs = require("fs");
const zlib = require("zlib");

const src = process.argv[2];
if (!src || !src.length) {
  process.stderr.write("missing input file");
  process.exit(1);
}

try {
  const raw = fs.readFileSync(src);
  const encoded = zlib
    .deflateSync(Buffer.from(raw), { level: zlib.constants.Z_BEST_COMPRESSION })
    .toString("base64");
  process.stdout.write(encoded);
} catch (e) {
  process.stderr.write(`error encoding: ${e.message}`);
  process.exit(1);
}
