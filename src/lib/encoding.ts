/** RN(Hermes)에는 crypto.randomUUID가 없어 자체 생성 (파일명 유일성 용도) */
export function randomId(): string {
  const hex = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${Date.now().toString(16)}-${hex()}${hex()}-${hex()}-${hex()}${hex()}`;
}

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hermes 환경 의존 없이 동작하는 base64 디코더 (사진 업로드용) */
export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = clean[i + 2] !== undefined ? B64.indexOf(clean[i + 2]) : -1;
    const d = clean[i + 3] !== undefined ? B64.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
