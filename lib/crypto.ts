// Criptografia simétrica para segredos em repouso (ex.: AIIntegration.apiKey).
// AES-256-GCM; formato armazenado: "v1:<iv b64>:<authTag b64>:<ciphertext b64>".
// ENCRYPTION_KEY: 32 bytes em base64 (gerar com `openssl rand -base64 32`). Uso apenas server-side.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PREFIX = "v1";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY não configurada");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [prefix, iv, tag, enc] = payload.split(":");
  if (prefix !== PREFIX || !iv || !tag || !enc) throw new Error("Formato de segredo inválido");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}

// Para exibir na UI após salvar: nunca devolver a chave, apenas a máscara.
export function maskSecret(plain: string): string {
  return plain.length <= 8 ? "••••" : `${plain.slice(0, 3)}••••${plain.slice(-4)}`;
}
