import CryptoJS from 'crypto-js';
import { encode as gbkEncode, decode as gbkDecode } from 'gbk.js';
// Convert 工具类 - 匹配 Flutter 实现
const Convert = {
  // UTF-8 编码解码
  encodeUtf8: (str: string): Uint8Array => {
    const encoder = new TextEncoder();
    return encoder.encode(str);
  },

  decodeUtf8: (buffer: ArrayBuffer | Uint8Array): string => {
    const decoder = new TextDecoder('utf-8');
    if (buffer instanceof Uint8Array) {
      return decoder.decode(buffer);
    }
    return decoder.decode(buffer);
  },

  // GBK 编码解码
  encodeGbk: (str: string): Uint8Array => {
    return new Uint8Array(gbkEncode(str));
  },

  decodeGbk: (buffer: ArrayBuffer | Uint8Array): string => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return gbkDecode(bytes);
  },

  // Base64 编码解码
  encodeBase64: (buffer: ArrayBuffer | Uint8Array): string => {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  decodeBase64: (base64: string): Uint8Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  // MD5 哈希 - 返回 Uint8Array
  md5: (data: string | ArrayBuffer | Uint8Array): Uint8Array => {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data);
    }
    return computeMd5Bytes(bytes);
  },

  // SHA1 哈希 - 返回 Uint8Array
  sha1: (data: string | ArrayBuffer | Uint8Array): Uint8Array => {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data);
    }
    return computeSha1Bytes(bytes);
  },

  // SHA256 哈希 - 返回 Uint8Array
  sha256: (data: string | ArrayBuffer | Uint8Array): Uint8Array => {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data);
    }
    return computeSha256Bytes(bytes);
  },

  // SHA512 哈希 - 返回 Uint8Array
  sha512: (data: string | ArrayBuffer | Uint8Array): Uint8Array => {
    let bytes: Uint8Array;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else {
      bytes = new Uint8Array(data);
    }
    return computeSha512Bytes(bytes);
  },

  // HMAC - 返回 Uint8Array
  hmac: (key: ArrayBuffer | Uint8Array, value: ArrayBuffer | Uint8Array, hash: string): Uint8Array => {
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
    const valueBytes = value instanceof Uint8Array ? value : new Uint8Array(value);

    let hasher: (data: Uint8Array) => Uint8Array;
    let blockSize: number;

    switch (hash.toLowerCase()) {
      case 'md5':
        hasher = computeMd5Bytes;
        blockSize = 64;
        break;
      case 'sha1':
        hasher = computeSha1Bytes;
        blockSize = 64;
        break;
      case 'sha256':
        hasher = computeSha256Bytes;
        blockSize = 64;
        break;
      case 'sha512':
        hasher = computeSha512Bytes;
        blockSize = 128;
        break;
      default:
        throw new Error(`Unsupported hash: ${hash}`);
    }

    // HMAC algorithm
    let paddedKey = keyBytes;
    if (keyBytes.length > blockSize) {
      paddedKey = hasher(keyBytes);
    }

    const innerPad = new Uint8Array(blockSize);
    const outerPad = new Uint8Array(blockSize);

    for (let i = 0; i < blockSize; i++) {
      const k = i < paddedKey.length ? paddedKey[i] : 0;
      innerPad[i] = k ^ 0x36;
      outerPad[i] = k ^ 0x5c;
    }

    const innerData = new Uint8Array(innerPad.length + valueBytes.length);
    innerData.set(innerPad);
    innerData.set(valueBytes, innerPad.length);

    const innerHash = hasher(innerData);

    const outerData = new Uint8Array(outerPad.length + innerHash.length);
    outerData.set(outerPad);
    outerData.set(innerHash, outerPad.length);

    return hasher(outerData);
  },

  // HMAC - 返回 hex 字符串
  hmacString: (key: ArrayBuffer | Uint8Array, value: ArrayBuffer | Uint8Array, hash: string): string => {
    const result = Convert.hmac(key, value, hash);
    return Convert.hexEncode(result);
  },

  // AES-ECB 解密
  decryptAesEcb: (value: ArrayBuffer | Uint8Array, key: ArrayBuffer | Uint8Array): Uint8Array => {
    const valueBytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);

    // 使用 crypto-js 解密
    const keyWordArray = CryptoJS.lib.WordArray.create(keyBytes);
    const valueWordArray = CryptoJS.lib.WordArray.create(valueBytes);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: valueWordArray } as any,
      keyWordArray,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );

    // 将 WordArray 转回 Uint8Array
    const result = new Uint8Array(decrypted.sigBytes);
    for (let i = 0; i < decrypted.sigBytes; i++) {
      result[i] = (decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return result;
  },

  // AES-CBC 解密
  decryptAesCbc: (value: ArrayBuffer | Uint8Array, key: ArrayBuffer | Uint8Array, iv: ArrayBuffer | Uint8Array): Uint8Array => {
    const valueBytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
    const ivBytes = iv instanceof Uint8Array ? iv : new Uint8Array(iv);

    const keyWordArray = CryptoJS.lib.WordArray.create(keyBytes);
    const ivWordArray = CryptoJS.lib.WordArray.create(ivBytes);
    const valueWordArray = CryptoJS.lib.WordArray.create(valueBytes);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: valueWordArray } as any,
      keyWordArray,
      { mode: CryptoJS.mode.CBC, iv: ivWordArray, padding: CryptoJS.pad.Pkcs7 }
    );

    const result = new Uint8Array(decrypted.sigBytes);
    for (let i = 0; i < decrypted.sigBytes; i++) {
      result[i] = (decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return result;
  },

  // AES-CFB 解密
  decryptAesCfb: (value: ArrayBuffer | Uint8Array, key: ArrayBuffer | Uint8Array, blockSize: number): Uint8Array => {
    const valueBytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);

    const keyWordArray = CryptoJS.lib.WordArray.create(keyBytes);
    const valueWordArray = CryptoJS.lib.WordArray.create(valueBytes);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: valueWordArray } as any,
      keyWordArray,
      { mode: CryptoJS.mode.CFB, iv: valueWordArray, padding: CryptoJS.pad.NoPadding, blockSize: blockSize / 8 }
    );

    const result = new Uint8Array(decrypted.sigBytes);
    for (let i = 0; i < decrypted.sigBytes; i++) {
      result[i] = (decrypted.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return result;
  },

  // AES-OFB 解密
  decryptAesOfb: (value: ArrayBuffer | Uint8Array, key: ArrayBuffer | Uint8Array, blockSize: number): Uint8Array => {
    // OFB mode is not directly supported by crypto-js, use CFB as approximation
    // or implement manually if needed
    throw new Error('AES-OFB decrypt not fully implemented');
  },

  // RSA 解密
  decryptRsa: (value: ArrayBuffer | Uint8Array, key: string): Uint8Array => {
    throw new Error('RSA decrypt not implemented in web environment');
  },

  // Hex 编码解码
  hexEncode: (bytes: ArrayBuffer | Uint8Array | string): string => {
    // 如果输入是字符串，先转为 UTF-8 Uint8Array
    if (typeof bytes === 'string') {
      bytes = new TextEncoder().encode(bytes);
    } else if (bytes instanceof ArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }
    const hexDigits = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      result += hexDigits.charAt((byte >> 4) & 0xF);
      result += hexDigits.charAt(byte & 0xF);
    }
    return result;
  },

  hexDecode: (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  },
};

export {
  Convert,
}

// MD5 实现 - 核心算法，操作 Uint8Array，返回 Uint8Array (16 bytes)
export function computeMd5Bytes(bytes: Uint8Array): Uint8Array {
  // 使用 crypto-js 计算 MD5
  const wordArray = CryptoJS.lib.WordArray.create(bytes);
  const hash = CryptoJS.MD5(wordArray);

  // 将 WordArray 转为 Uint8Array (16 bytes)
  const result = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    result[i] = (hash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return result;
}

// SHA1 实现 - 返回 Uint8Array (20 bytes)
export function computeSha1Bytes(bytes: Uint8Array): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(bytes);
  const hash = CryptoJS.SHA1(wordArray);

  const result = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    result[i] = (hash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return result;
}

// SHA256 实现 - 返回 Uint8Array (32 bytes)
export function computeSha256Bytes(bytes: Uint8Array): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(bytes);
  const hash = CryptoJS.SHA256(wordArray);

  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = (hash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return result;
}

// SHA512 实现 - 返回 Uint8Array (64 bytes)
export function computeSha512Bytes(bytes: Uint8Array): Uint8Array {
  const wordArray = CryptoJS.lib.WordArray.create(bytes);
  const hash = CryptoJS.SHA512(wordArray);

  const result = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    result[i] = (hash.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return result;
}


