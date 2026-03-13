declare module 'gbk.js' {
  /**
   * Encode string to GBK bytes
   * @param str UTF-8 string
   * @returns GBK encoded byte array
   */
  export function encode(str: string): number[];

  /**
   * Decode GBK bytes to string
   * @param bytes GBK encoded byte array or Uint8Array
   * @returns UTF-8 decoded string
   */
  export function decode(bytes: number[] | Uint8Array): string;
}
