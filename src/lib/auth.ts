import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { get } from "./db";

function secret(): string {
  const p = path.join(process.cwd(), "data", "secret.txt");
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, crypto.randomBytes(32).toString("hex"));
  }
  return fs.readFileSync(p, "utf8").trim();
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function createToken(userId: number): string {
  const payload = b64url(JSON.stringify({ uid: userId, t: Date.now() }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): number | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  const calc = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (calc !== sig) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, "base64url").toString());
    // 30 天有效
    if (Date.now() - obj.t > 30 * 86400_000) return null;
    return obj.uid as number;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: number;
  username: string;
  role: string;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get("wb_session")?.value;
  if (!token) return null;
  const uid = verifyToken(token);
  if (!uid) return null;
  const u = get<{ id: number; username: string; role: string }>(
    "SELECT id,username,role FROM users WHERE id=?", uid
  );
  return u ?? null;
}
