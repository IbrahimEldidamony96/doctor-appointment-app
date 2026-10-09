import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { getCheckoutUrl, isPaymobConfigured, isSettledPayment, verifyPaymobHmac, type PaymobTransaction } from "../lib/paymob";
import { escapeHtml } from "../lib/resend";

const transaction: PaymobTransaction = {
  amount_cents: 10000, created_at: "2026-10-04T10:00:00", currency: "EGP",
  error_occured: false, has_parent_transaction: false, id: 192036465, integration_id: 1234,
  is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false,
  is_standalone_payment: true, is_voided: false, order: { id: 217503754 }, owner: 302852,
  pending: false, source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true,
};

test("Paymob uses the documented ordered HMAC fields and rejects signed-field tampering", () => {
  process.env.PAYMOB_HMAC_SECRET = "local-test-hmac-secret";
  // Fixed independent string: changing implementation field order fails this fixture.
  const fields = "100002026-10-04T10:00:00EGPfalsefalse1920364651234truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue";
  const signature = createHmac("sha512", process.env.PAYMOB_HMAC_SECRET).update(fields).digest("hex");
  assert.equal(verifyPaymobHmac(transaction, signature), true);
  assert.equal(verifyPaymobHmac(transaction, signature.toUpperCase()), true);
  assert.equal(verifyPaymobHmac({ ...transaction, amount_cents: 100 }, signature), false);
  assert.equal(verifyPaymobHmac({ ...transaction, order: { id: 123 } }, signature), false);
  assert.equal(verifyPaymobHmac({ ...transaction, success: "false" }, signature), false);
  assert.equal(verifyPaymobHmac(transaction, "invalid"), false);
  assert.equal(verifyPaymobHmac(null, signature), false);
});

test("pending, auth-only, refund, void and error callbacks cannot count as paid", () => {
  assert.equal(isSettledPayment(transaction), true);
  for (const field of ["pending", "is_auth", "is_refunded", "is_voided", "error_occured", "has_parent_transaction"] as const) {
    assert.equal(isSettledPayment({ ...transaction, [field]: true }), false);
  }
  assert.equal(isSettledPayment({ ...transaction, success: false }), false);
  assert.equal(isSettledPayment({ ...transaction, is_standalone_payment: false }), false);
  assert.equal(isSettledPayment({ ...transaction, is_standalone_payment: false, is_capture: true }), true);
});

test("checkout query values are encoded and patient HTML is escaped", () => {
  process.env.PAYMOB_PUBLIC_KEY = "public-key";
  const url = new URL(getCheckoutUrl("secret&injected=true"));
  assert.equal(url.searchParams.get("clientSecret"), "secret&injected=true");
  assert.equal(url.searchParams.has("injected"), false);
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & test'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test");
});

test("checkout availability requires complete valid provider configuration", () => {
  const keys = ["PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY", "PAYMOB_HMAC_SECRET", "PAYMOB_INTEGRATION_ID", "NEXT_PUBLIC_APP_URL"];
  const previous = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(isPaymobConfigured(), false);
    Object.assign(process.env, {
      PAYMOB_SECRET_KEY: "test-secret", PAYMOB_PUBLIC_KEY: "test-public", PAYMOB_HMAC_SECRET: "test-hmac",
      PAYMOB_INTEGRATION_ID: "123", NEXT_PUBLIC_APP_URL: "https://clinic.example",
    });
    assert.equal(isPaymobConfigured(), true);
    process.env.PAYMOB_INTEGRATION_ID = "invalid";
    assert.equal(isPaymobConfigured(), false);
    process.env.PAYMOB_INTEGRATION_ID = "123";
    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    assert.equal(isPaymobConfigured(), false);
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
