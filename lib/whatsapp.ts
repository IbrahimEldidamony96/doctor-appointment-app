import "server-only";

const GRAPH_API_VERSION = "v21.0";

function normalizePhone(phone: string) {
  // WhatsApp Cloud API expects digits only, no leading "+"
  return phone.replace(/[^\d]/g, "");
}

/**
 * IMPORTANT: WhatsApp Cloud API generally does not allow free-form
 * text as the first message to a user — Meta requires an approved
 * "Authentication" message template for OTP-style messages in
 * production. Free-form text like below only works reliably with
 * registered test numbers in the Meta developer sandbox, or if the
 * recipient already messaged your business number within 24h.
 *
 * Before going to production: create an authentication template in
 * Meta Business Manager, get it approved, then switch the body
 * below to `type: "template"` referencing it.
 */
export async function sendWhatsAppMessage(phone: string, message: string) {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WhatsApp Cloud API environment variables");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizePhone(phone),
        type: "text",
        text: { body: message },
      }),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody}`);
  }

  return res.json();
}
