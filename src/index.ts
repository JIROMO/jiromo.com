const MAX_BODY_BYTES = 20_000;
const TURNSTILE_ACTION = "contact";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s]+$/;
const CATEGORIES = [
  "新規開発のご相談",
  "既存システムの改修・機能追加",
  "Salesforce連携",
  "Webサイト・EC",
  "その他",
];

type Inquiry = {
  name: string;
  company: string;
  email: string;
  phone: string;
  category: string;
  message: string;
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const singleLine = (value: unknown) =>
  typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim() : "";

function validate(input: Record<string, unknown>) {
  const inquiry: Inquiry = {
    name: singleLine(input.name),
    company: singleLine(input.company),
    email: singleLine(input.email),
    phone: singleLine(input.phone),
    category: singleLine(input.category),
    message: typeof input.message === "string" ? input.message.trim() : "",
  };
  const errors: Record<string, string> = {};

  if (!inquiry.name) errors.name = "お名前を入力してください。";
  else if (inquiry.name.length > 100) errors.name = "お名前は100文字以内で入力してください。";
  if (inquiry.company.length > 100) errors.company = "会社名は100文字以内で入力してください。";
  if (!inquiry.email) errors.email = "メールアドレスを入力してください。";
  else if (inquiry.email.length > 254 || !EMAIL_PATTERN.test(inquiry.email)) {
    errors.email = "メールアドレスの形式をご確認ください。";
  }
  if (inquiry.phone && (inquiry.phone.length > 30 || !PHONE_PATTERN.test(inquiry.phone))) {
    errors.phone = "電話番号の形式をご確認ください。";
  }
  if (!CATEGORIES.includes(inquiry.category)) errors.category = "ご相談の種類を選択してください。";
  if (!inquiry.message) errors.message = "ご相談内容を入力してください。";
  else if (inquiry.message.length > 5000) errors.message = "ご相談内容は5000文字以内で入力してください。";
  if (input.privacy !== true) errors.privacy = "プライバシーポリシーへの同意が必要です。";

  return { inquiry, errors };
}

async function verifyTurnstile(token: unknown, request: Request, env: Env) {
  const hostnames = new Set(
    env.TURNSTILE_HOSTNAMES.split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
  if (typeof token !== "string" || !token || token.length > 2048 || hostnames.size === 0) {
    return false;
  }

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) body.set("remoteip", clientIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const result = await response.json<{ success: boolean; action?: string; hostname?: string }>();
    return (
      result.success === true &&
      result.action === TURNSTILE_ACTION &&
      hostnames.has(result.hostname ?? "")
    );
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

async function sendNotification(id: string, inquiry: Inquiry, env: Env) {
  const rows: [string, string][] = [
    ["ご相談の種類", inquiry.category],
    ["お名前", inquiry.name],
    ["会社名", inquiry.company || "（未入力）"],
    ["メールアドレス", inquiry.email],
    ["電話番号", inquiry.phone || "（未入力）"],
  ];
  const text = [
    "jiromo.com のフォームからお問い合わせがありました。",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "ご相談内容:",
    inquiry.message,
    "",
    `受付ID: ${id}`,
  ].join("\n");
  const html = [
    "<p>jiromo.com のフォームからお問い合わせがありました。</p>",
    "<table>",
    ...rows.map(
      ([label, value]) =>
        `<tr><th align="left" style="padding-right:16px">${label}</th><td>${escapeHtml(value)}</td></tr>`,
    ),
    "</table>",
    "<p><b>ご相談内容</b></p>",
    `<p style="white-space:pre-wrap">${escapeHtml(inquiry.message)}</p>`,
    `<p style="color:#666">受付ID: ${id}</p>`,
  ].join("");

  await env.EMAIL.send({
    to: env.CONTACT_TO,
    from: { email: env.CONTACT_FROM, name: "JIROMO お問い合わせ" },
    replyTo: inquiry.email,
    subject: `【お問い合わせ】${inquiry.category}｜${inquiry.name}`.slice(0, 200),
    text,
    html,
  });
}

async function handleContact(request: Request, env: Env) {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (request.headers.get("Origin") !== new URL(request.url).origin) {
    return json({ error: "forbidden" }, 403);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return json({ error: "too_large" }, 413);
  }
  let input: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    input = parsed;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }

  // 人には見えない項目に入力があればbotとみなし、成功を装って何もしない。
  if (singleLine(input.website)) return json({ ok: true });

  // 検証に失敗してもTurnstileのトークンを消費しないよう、入力チェックを先に行う。
  const { inquiry, errors } = validate(input);
  if (Object.keys(errors).length > 0) return json({ error: "validation", errors }, 422);

  if (!(await verifyTurnstile(input.token, request, env))) {
    return json({ error: "turnstile" }, 403);
  }

  const id = crypto.randomUUID();
  let saved = false;
  try {
    await env.DB.prepare(
      `INSERT INTO contact_inquiries (id, name, company, email, phone, category, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, inquiry.name, inquiry.company, inquiry.email, inquiry.phone, inquiry.category, inquiry.message)
      .run();
    saved = true;
  } catch (error) {
    console.error("contact_save_failed", id, error instanceof Error ? error.message : "unknown");
  }

  let sent = false;
  try {
    await sendNotification(id, inquiry, env);
    sent = true;
  } catch (error) {
    console.error("contact_mail_failed", id, error instanceof Error ? error.message : "unknown");
  }

  if (saved) {
    try {
      await env.DB.prepare("UPDATE contact_inquiries SET mail_status = ? WHERE id = ?")
        .bind(sent ? "sent" : "failed", id)
        .run();
    } catch (error) {
      console.error("contact_status_failed", id, error instanceof Error ? error.message : "unknown");
    }
  }

  // 保存かメールのどちらかが成功していれば、問い合わせは受け取れている。
  if (!saved && !sent) return json({ error: "server" }, 500);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/api/contact") {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
