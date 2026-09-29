import { hashPassword as baHash, verifyPassword as baVerify } from "better-auth/crypto";

export async function hashPassword(password: string): Promise<string> {
  return baHash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return baVerify({ hash, password });
}
