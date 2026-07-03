// Netlify Function: recibe los leads del formulario y los guarda en Notion.
// Configura en Netlify (Site settings > Environment variables):
//   NOTION_TOKEN        -> el "Internal Integration Secret" de tu integración de Notion
//   NOTION_DATABASE_ID  -> el ID de la base de datos "Registros - AI Workshop Miami (Learn5)"
//
// La integración de Notion debe tener acceso compartido a esa base de datos
// (en Notion: abre la base de datos > ... > Add connections > selecciona tu integración).

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    console.error('Faltan variables de entorno NOTION_TOKEN / NOTION_DATABASE_ID');
    return { statusCode: 500, body: JSON.stringify({ error: 'Servidor no configurado todavía' }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { nombre, email, whatsapp, profesion, objetivo, estado_pago } = data;

  if (!nombre || !email || !whatsapp) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
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
      return { statusCode: 502, body: JSON.stringify({ error: 'Error al guardar en Notion' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno' }) };
  }
};
