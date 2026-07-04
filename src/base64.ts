/*
 * Minimal base64 codec replacing the `base64-js` dependency.
 *
 * Relies on the standard `btoa`/`atob` globals, available in Node >= 16 (this
 * project requires >= 22) and all modern browsers. Produces and consumes
 * standard base64 (`+`/`/`), matching what HdrHistogram encodes.
 */

// Uint8Array -> standard base64 string.
// Build the binary string in chunks so large inputs (e.g. the WASM blob) don't
// overflow String.fromCharCode's argument-stack limit.
export function fromByteArray(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[]
    );
  }
  return btoa(binary);
}

// standard base64 string -> Uint8Array.
export function toByteArray(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
