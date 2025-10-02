import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import dotenv from "dotenv";
dotenv.config();

const ALGO = "aes-256-gcm";
if(!process.env.MASTER_KEY_HEX)
    throw new Error("missing master key");
const KEY = Buffer.from(process.env.MASTER_KEY_HEX, "hex"); // 32-byte hex key
const IV_LEN = 12;

export function encryptPrivateKey(pkHex: string) {
  // remove 0x prefix if present, but do it inside the function
  const cleanHex = pkHex.startsWith("0x") ? pkHex.slice(2) : pkHex;

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(cleanHex, "hex")),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptPrivateKey(ciphertext: string, iv: string, tag: string) {
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return "0x" + decrypted.toString("hex");
}
