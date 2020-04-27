import { BINARY } from "../generated-wasm";
const loader = require("@assemblyscript/loader");
const base64 = require("base64-js");

//console.log(loader);
const wasm = loader.instantiateSync(base64.toByteArray(BINARY));
console.log(wasm);
