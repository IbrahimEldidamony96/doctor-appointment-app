import "server-only";

const GRAPH_API_VERSION = "v21.0";
const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "ar";

function config() {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("Missing WhatsApp Cloud API credentials");
  return { token, phoneId };
}

export function assertOtpTemplateConfigured() {
  if (!process.env.WHATSAPP_AUTH_TEMPLATE_NAME) throw new Error("Missing WhatsApp authentication template");
}

async function sendTemplate(phone: string, name: string | undefined, values: string[], otpCode?: string) {
  const { token, phoneId } = config();
  if (!name) throw new Error("Approved WhatsApp template not configured");
  const components: Array<Record<string, unknown>> = [];
  if (values.length) components.push({
    type: "body",
    parameters: values.map((text) => ({ type: "text", text })),
  });
  if (otpCode) components.push({
    type: "button", sub_type: "url", index: 0,
    parameters: [{ type: "text", text: otpCode }],
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone.replace(/\D/g, ""),
      type: "template",
      template: { name, language: { code: language }, components },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WhatsApp template send failed (${res.status})`);
  return res.json();
}

export async function sendWhatsAppOtp(phone: string, code: string) {
  assertOtpTemplateConfigured();
  return sendTemplate(phone, process.env.WHATSAPP_AUTH_TEMPLATE_NAME, [code], code);
}

/** Approved utility template placeholders: {{1}} date, {{2}} time. */
export async function sendAppointmentReminder(phone: string, date: string, time: string) {
  return sendTemplate(phone, process.env.WHATSAPP_REMINDER_TEMPLATE_NAME, [date, time]);
}

/** Approved utility template placeholders: {{1}} event, {{2}} patient, {{3}} date, {{4}} time. */
export async function sendDoctorNotification(phone: string, event: string, name: string, date: string, time: string) {
  return sendTemplate(phone, process.env.WHATSAPP_DOCTOR_TEMPLATE_NAME, [event, name, date, time]);
}
