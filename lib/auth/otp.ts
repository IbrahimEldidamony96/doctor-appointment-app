import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOtpTemplateConfigured, sendWhatsAppOtp } from "@/lib/whatsapp";
import { getAuthSecret } from "./secrets";

type FailReason = "not_found" | "expired" | "too_many_attempts" | "invalid_code";
type IssueResult = { success: true } | { success: false; reason: "too_many_requests"; retryAfter: number };
type VerifyResult = { success: true } | { success: false; reason: FailReason };

function hashCode(phone: string, code: string) {
  return createHmac("sha256", getAuthSecret("OTP_HASH_SECRET"))
    .update(`${phone}:${code}`).digest("hex");
}

export async function sendOtp(phone: string): Promise<IssueResult> {
  assertOtpTemplateConfigured();
  const code = randomInt(100000, 1000000).toString();
  const { data, error } = await createServiceClient().rpc("issue_otp", {
    p_phone: phone, p_code_hash: hashCode(phone, code),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("OTP issuance unavailable");
  }
  const result = data as { success?: boolean; reason?: string; retry_after?: number };
  if (!result.success) {
    if (result.reason !== "too_many_requests") throw new Error("Unexpected OTP issuer response");
    return { success: false, reason: "too_many_requests", retryAfter: result.retry_after ?? 60 };
  }
  await sendWhatsAppOtp(phone, code);
  return { success: true };
}

export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const { data, error } = await createServiceClient().rpc("verify_otp", {
    p_phone: phone, p_code_hash: hashCode(phone, code),
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("OTP verification unavailable");
  }
  const result = data as { success?: boolean; reason?: string };
  if (result.success === true) return { success: true };
  if (["not_found", "expired", "too_many_attempts", "invalid_code"].includes(result.reason ?? "")) {
    return { success: false, reason: result.reason as FailReason };
  }
  throw new Error("Unexpected OTP verification response");
}
