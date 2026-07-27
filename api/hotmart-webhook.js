// ============================================================
// /api/hotmart-webhook.js
// Hotmart → Notion + Resend integration
// Deploy on Vercel (same repo as the landing page)
//
// Required env vars in Vercel:
//   HOTMART_TOKEN        → token you set in Hotmart webhook config
//   RESEND_API_KEY       → from resend.com
//   NOTION_TOKEN         → Notion integration secret
//   NOTION_STUDENTS_DB   → Notion database ID for students
// ============================================================

const HOTMART_TOKEN    = process.env.HOTMART_TOKEN;
const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const NOTION_TOKEN     = process.env.NOTION_TOKEN;
const NOTION_DB        = process.env.NOTION_STUDENTS_DB;
const FROM_EMAIL       = 'Learn5 <contacto@learn5.tech>';
const COURSE_URL       = 'https://app.hotmart.com/membership/ia-en-30-dias-miami/home';
const WA_URL           = 'https://wa.me/17865271196';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Validate Hotmart token ──────────────────────────────
  const receivedToken = req.headers['x-hotmart-hottok'];
  if (HOTMART_TOKEN && receivedToken !== HOTMART_TOKEN) {
    console.warn('[hotmart-webhook] Invalid token received:', receivedToken);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body;
  const event = body?.event;
  console.log('[hotmart-webhook] Event received:', event);

  // ── 2. Only process completed purchases ───────────────────
  const allowedEvents = [
    'PURCHASE_COMPLETE',
    'PURCHASE_APPROVED',
    'PURCHASE_BILLET_PRINTED',
  ];
  if (!allowedEvents.includes(event)) {
    return res.status(200).json({ ok: true, skipped: true, event });
  }

  // ── 3. Extract buyer data ─────────────────────────────────
  const purchase = body?.data?.purchase;
  const buyer    = purchase?.buyer;

  if (!buyer?.email) {
    console.error('[hotmart-webhook] No buyer email in payload');
    return res.status(400).json({ error: 'Missing buyer email' });
  }

  const studentData = {
    name:        buyer.name        || 'Estudiante',
    email:       buyer.email,
    phone:       buyer.phone       || '',
    transaction: purchase.transaction || '',
    pricePaid:   purchase.full_price?.value || 0,
    currency:    purchase.full_price?.currency_value || 'USD',
    offer:       purchase.offer?.code || '',
    purchaseDate: purchase.order_date
      ? new Date(purchase.order_date).toISOString()
      : new Date().toISOString(),
    status: purchase.status || 'APPROVED',
  };

  console.log('[hotmart-webhook] Student:', studentData.email);

  // ── 4. Save to Notion ─────────────────────────────────────
  const notionResult = await saveToNotion(studentData);
  if (!notionResult.ok) {
    console.error('[hotmart-webhook] Notion error:', notionResult.error);
    // Don't return — still try to send email
  }

  // ── 5. Send welcome email ─────────────────────────────────
  const emailResult = await sendWelcomeEmail(studentData.email, studentData.name);
  if (!emailResult.ok) {
    console.error('[hotmart-webhook] Email error:', emailResult.error);
  }

  return res.status(200).json({
    ok: true,
    notion: notionResult.ok,
    email: emailResult.ok,
  });
}

// ─────────────────────────────────────────────────────────────
// Notion: create a new page (student record) in the database
// ─────────────────────────────────────────────────────────────
async function saveToNotion(data) {
  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DB },
        properties: {
          // Title field (must match your DB column name exactly)
          'Nombre': {
            title: [{ text: { content: data.name } }],
          },
          'Email': {
            email: data.email,
          },
          'Teléfono': {
            phone_number: data.phone || null,
          },
          'Transacción Hotmart': {
            rich_text: [{ text: { content: data.transaction } }],
          },
          'Precio Pagado': {
            number: data.pricePaid,
          },
          'Moneda': {
            select: { name: data.currency },
          },
          'Fecha de Compra': {
            date: { start: data.purchaseDate },
          },
          'Estado': {
            select: { name: 'Inscrito' },
          },
          'Oferta': {
            rich_text: [{ text: { content: data.offer } }],
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: errText };
    }
    const json = await response.json();
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Resend: send personalized welcome email
// ─────────────────────────────────────────────────────────────
async function sendWelcomeEmail(to, fullName) {
  const firstName = (fullName || 'Estudiante').split(' ')[0];
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `¡Bienvenido a IA en 30 Días, ${firstName}! 🚀`,
        html: buildEmailHTML(firstName),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: errText };
    }
    const json = await response.json();
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Email HTML template — IA en 30 Días · Miami Edition
// ─────────────────────────────────────────────────────────────
function buildEmailHTML(firstName) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Bienvenido a IA en 30 Días! – Learn5</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1117; font-family: 'Montserrat', Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 620px; margin: 0 auto; padding: 32px 16px; }
    .header { text-align: center; padding: 36px 32px 28px; background: linear-gradient(160deg, #0f172a 0%, #1a0533 100%); border-radius: 16px 16px 0 0; border: 1px solid rgba(168,85,247,0.25); border-bottom: none; }
    .logo { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #fff; margin-bottom: 20px; }
    .logo span { color: #22d3ee; }
    .header-badge { display: inline-block; background: linear-gradient(90deg, #22d3ee, #a855f7); border-radius: 999px; padding: 4px 16px; font-size: 11px; font-weight: 700; color: #0d1117; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 16px; }
    .header h1 { font-size: 26px; font-weight: 900; line-height: 1.25; color: #fff; margin-bottom: 10px; }
    .header h1 span { color: #22d3ee; }
    .header p { font-size: 15px; color: #94a3b8; line-height: 1.6; }
    .body { background: #111827; padding: 36px 32px; border: 1px solid rgba(168,85,247,0.15); border-top: none; border-bottom: none; }
    .greeting { font-size: 16px; color: #e2e8f0; line-height: 1.7; margin-bottom: 28px; }
    .greeting strong { color: #22d3ee; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #a855f7; margin-bottom: 14px; }
    .week-card { border-radius: 12px; padding: 20px 22px; margin-bottom: 12px; }
    .week-card.w1 { background: linear-gradient(135deg, rgba(34,211,238,0.08), rgba(34,211,238,0.03)); border: 1px solid rgba(34,211,238,0.2); }
    .week-card.w2 { background: linear-gradient(135deg, rgba(168,85,247,0.08), rgba(168,85,247,0.03)); border: 1px solid rgba(168,85,247,0.2); }
    .week-card.w3 { background: linear-gradient(135deg, rgba(56,189,248,0.08), rgba(56,189,248,0.03)); border: 1px solid rgba(56,189,248,0.2); }
    .week-card.w4 { background: linear-gradient(135deg, rgba(236,72,153,0.08), rgba(236,72,153,0.03)); border: 1px solid rgba(236,72,153,0.2); }
    .week-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
    .w1 .week-label { color: #22d3ee; }
    .w2 .week-label { color: #a855f7; }
    .w3 .week-label { color: #38bdf8; }
    .w4 .week-label { color: #ec4899; }
    .week-title { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .week-tools { font-size: 12.5px; color: #64748b; }
    .week-tools strong { color: #94a3b8; }
    .benefits { margin: 28px 0; }
    .benefit-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .benefit-item:last-child { border-bottom: none; }
    .benefit-icon { font-size: 18px; flex-shrink: 0; }
    .benefit-text { font-size: 14px; color: #cbd5e1; line-height: 1.5; }
    .benefit-text strong { color: #e2e8f0; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(168,85,247,0.4), transparent); margin: 28px 0; }
    .access-box { background: linear-gradient(135deg, rgba(34,211,238,0.06), rgba(168,85,247,0.06)); border: 1px solid rgba(168,85,247,0.3); border-radius: 12px; padding: 22px 24px; margin-bottom: 28px; }
    .access-box h3 { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 14px; }
    .access-step { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .step-num { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #22d3ee, #a855f7); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: #0d1117; flex-shrink: 0; }
    .step-text { font-size: 13.5px; color: #cbd5e1; line-height: 1.5; }
    .step-text strong { color: #fff; }
    .step-text a { color: #22d3ee; text-decoration: none; }
    .cta-wrap { text-align: center; margin: 28px 0; }
    .cta-btn { display: inline-block; background: linear-gradient(90deg, #22d3ee, #a855f7); color: #0d1117; font-size: 15px; font-weight: 900; text-decoration: none; padding: 16px 36px; border-radius: 999px; letter-spacing: 0.5px; }
    .cta-sub { font-size: 12px; color: #64748b; margin-top: 10px; }
    .footer { background: #0d1117; border: 1px solid rgba(168,85,247,0.15); border-top: none; border-radius: 0 0 16px 16px; padding: 24px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #475569; line-height: 1.7; }
    .footer a { color: #22d3ee; text-decoration: none; }
    .footer .brand { font-size: 14px; font-weight: 900; color: #fff; margin-bottom: 8px; letter-spacing: 1px; }
    .footer .brand span { color: #22d3ee; }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="logo">LEARN<span>5</span></div>
    <div class="header-badge">✅ Inscripción confirmada</div>
    <h1>¡Bienvenido a<br><span>IA en 30 Días!</span></h1>
    <p>Miami Edition · Virtual · 100% en línea</p>
  </div>

  <div class="body">
    <p class="greeting">
      Hola, <strong>${firstName}</strong> 👋<br><br>
      ¡Tu inscripción a <strong>IA en 30 Días — Miami Edition</strong> está confirmada!
      Durante las próximas 4 semanas aprenderás 30 herramientas de IA reales,
      una por día, con sesiones virtuales en vivo y campus online 24/7.<br><br>
      Esto es lo que te espera 👇
    </p>

    <div class="section-title">📋 Tu programa semana a semana</div>

    <div class="week-card w1">
      <div class="week-label">Semana 1 · Sesión virtual en vivo · 1.5 h</div>
      <div class="week-title">Fundamentos &amp; Prompting inteligente</div>
      <div class="week-tools"><strong>Herramientas:</strong> ChatGPT · Claude · Gemini · Perplexity · Copilot · NotebookLM</div>
    </div>

    <div class="week-card w2">
      <div class="week-label">Semana 2 · Sesión virtual en vivo · 1.5 h</div>
      <div class="week-title">Contenido &amp; Creatividad con IA</div>
      <div class="week-tools"><strong>Herramientas:</strong> Canva AI · Leonardo · ElevenLabs · HeyGen · CapCut AI · Runway</div>
    </div>

    <div class="week-card w3">
      <div class="week-label">Semana 3 · Sesión virtual en vivo · 1.5 h</div>
      <div class="week-title">Automatización &amp; Productividad</div>
      <div class="week-tools"><strong>Herramientas:</strong> Make · Zapier · Notion AI · Typebot · n8n · Gamma</div>
    </div>

    <div class="week-card w4">
      <div class="week-label">Semana 4 · Sesión virtual en vivo · 1.5 h</div>
      <div class="week-title">Agentes IA &amp; Plan de acción</div>
      <div class="week-tools"><strong>Herramientas:</strong> Custom GPTs · Claude Projects · Dify · Voiceflow · Beautiful.ai</div>
    </div>

    <div class="benefits" style="margin-top:28px;">
      <div class="section-title">🎁 Todo lo que incluye tu inscripción</div>
      <div class="benefit-item">
        <div class="benefit-icon">🖥️</div>
        <div class="benefit-text"><strong>4 sesiones virtuales en vivo por Zoom</strong> — 1.5 h cada una, con el facilitador en directo</div>
      </div>
      <div class="benefit-item">
        <div class="benefit-icon">🌐</div>
        <div class="benefit-text"><strong>Campus online 24/7 por 30 días</strong> — micro-videos, retos y guías por herramienta</div>
      </div>
      <div class="benefit-item">
        <div class="benefit-icon">👥</div>
        <div class="benefit-text"><strong>Comunidad privada</strong> — soporte continuo durante todo el programa</div>
      </div>
      <div class="benefit-item">
        <div class="benefit-icon">📜</div>
        <div class="benefit-text"><strong>Certificado oficial de finalización</strong> — emitido por Learn5</div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="access-box">
      <h3>🚀 ¿Cómo acceder a tu programa?</h3>
      <div class="access-step">
        <div class="step-num">1</div>
        <div class="step-text">
          Entra a tu campus en Hotmart:<br>
          <a href="${COURSE_URL}">${COURSE_URL}</a>
        </div>
      </div>
      <div class="access-step">
        <div class="step-num">2</div>
        <div class="step-text">
          <strong>Inicia sesión</strong> con el email con el que compraste.<br>
          Si es tu primera vez, Hotmart te pedirá crear una contraseña.
        </div>
      </div>
      <div class="access-step">
        <div class="step-num">3</div>
        <div class="step-text">
          El link de Zoom para cada sesión en vivo llegará a tu correo <strong>48 horas antes</strong> de cada clase.
        </div>
      </div>
    </div>

    <div class="cta-wrap">
      <a class="cta-btn" href="${COURSE_URL}">Acceder a mi campus →</a>
      <div class="cta-sub">¿Dudas? Escríbenos por <a href="${WA_URL}" style="color:#22d3ee;">WhatsApp +1 786 527 1196</a></div>
    </div>

  </div>

  <div class="footer">
    <div class="brand">LEARN<span>5</span></div>
    <p>
      Aprende. Aplica. Transforma.<br>
      <a href="https://ai-workshop-miami.vercel.app/">ai-workshop-miami.vercel.app</a> ·
      <a href="mailto:contacto@learn5.tech">contacto@learn5.tech</a><br>
      WhatsApp: <a href="${WA_URL}">+1 786 527 1196</a>
    </p>
  </div>

</div>
</body>
</html>`;
}
