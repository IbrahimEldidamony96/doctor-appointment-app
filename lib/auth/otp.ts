import "server-only";
import { createHmac, randomInt } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

/**
 * HMAC the code before storing it — never store the raw OTP.
 * Uses OTP_HASH_SECRET, a dedicated secret (keep separate from
 * PATIENT_JWT_SECRET so rotating one doesn't affect the other).
 */
function hashCode(phone: string, code: string) {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("Missing OTP_HASH_SECRET");
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export async function sendOtp(phone: string) {
  const code = randomInt(100000, 999999).toString();
  const codeHash = hashCode(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const supabase = createServiceClient();
  const { error } = await supabase.from("otp_codes").insert({
    phone,
    code_hash: codeHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw error;

  await sendWhatsAppMessage(
    phone,
    `كود التحقق: ${code}\nصالح لمدة ${OTP_TTL_MINUTES} دقايق.`
  );
}

type VerifyResult =
  | { success: true }
  | { success: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid_code" };

export async function verifyOtp(phone: string, code: string): Promise<VerifyResult> {
  const supabase = createServiceClient();

  const { data: otpRow, error } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !otpRow) {
    return { success: false, reason: "not_found" };
  }

  if (new Date(otpRow.expires_at) < new Date()) {
    return { success: false, reason: "expired" };
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    return { success: false, reason: "too_many_attempts" };
  }

  const isValid = hashCode(phone, code) === otpRow.code_hash;

  if (!isValid) {
    await supabase
      .from("otp_codes")
      .update({ attempts: otpRow.attempts + 1 })
      .eq("id", otpRow.id);
    return { success: false, reason: "invalid_code" };
  }

  // Consume the OTP so it can't be replayed.
  await supabase.from("otp_codes").delete().eq("id", otpRow.id);

  return { success: true };
}
