const fs = require("fs");

const src = process.argv[2];
if (!src || !src.length) {
  process.stderr.write("missing input file");
  process.exit(1);
}

try {
  const raw = fs.readFileSync(src);
  const encoded = Buffer.from(raw).toString("base64");
  process.stdout.write(encoded);
} catch (e) {
  process.stderr.write(`error encoding: ${e.message}`);
  process.exit(1);
}
