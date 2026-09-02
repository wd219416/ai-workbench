import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 敏感字段（API KEY 类）在入库前加密、读取时解密。
 *  方案：AES-256-GCM，主密钥 32 字节存 data/fieldkey.bin（首次自动生成，权限 0600）。
 *  密文格式："enc:" + base64(iv(12) || ciphertext || tag(16))。
 *  历史/迁移期明文不前缀，decField 原样返回，由迁移逻辑择机加密。 */

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "fieldkey.bin");
let _key: Buffer | null = null;

function loadKey(): Buffer {
  if (_key) return _key;
  if (!fs.existsSync(KEY_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    _key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, _key, { mode: 0o600 });
    return _key;
  }
  _key = fs.readFileSync(KEY_FILE);
  if (_key.length !== 32) throw new Error("fieldkey.bin 长度异常，请删除后重启自动重建");
  return _key;
}

export function isSensitiveKey(k: string): boolean {
  return /(_key|_sk|_ak|_token)$/.test(k);
}

export function encField(plain: string): string {
  if (!plain || plain.startsWith("enc:")) return plain;
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return "enc:" + Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decField(stored: string): string {
  if (!stored || !stored.startsWith("enc:")) return stored;
  try {
    const buf = Buffer.from(stored.slice(4), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(12, buf.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", loadKey(), iv);
    d.setAuthTag(Buffer.from(tag));
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
