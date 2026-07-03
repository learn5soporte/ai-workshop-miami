// Vercel Serverless Function (CommonJS): recibe los leads y los guarda en Notion.
// Variables de entorno requeridas en Vercel (Project Settings > Environment Variables):
//   NOTION_TOKEN        -> Internal Integration Secret de Notion
//   NOTION_DATABASE_ID  -> ID de la base de datos

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    console.error('Faltan variables de entorno NOTION_TOKEN / NOTION_DATABASE_ID');
    return res.status(500).json({ error: 'Servidor no configurado' });
  }

  const { nombre, email, whatsapp, profesion, objetivo, estado_pago } = req.body || {};

  if (!nombre || !email || !whatsapp) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }

  try {
    const resp = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          'Nombre completo': { title: [{ text: { content: nombre } }] },
          'Email': { email: email },
          'WhatsApp': { phone_number: whatsapp },
          'Profesion / Emprendimiento': { rich_text: [{ text: { content: profesion || '' } }] },
          'Objetivo con IA': { rich_text: [{ text: { content: objetivo || '' } }] },
          'Estado de pago': { select: { name: estado_pago || 'Pendiente' } }
        }
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Notion API error:', errText);
      return res.status(502).json({ error: 'Error al guardar en Notion' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  }
};
