export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const payload = {
    model: 'claude-haiku-4-5',
    max_tokens: body.max_tokens || 900,
    messages: body.messages || []
  };

  if (body.system) payload.system = body.system;

  // 25-second timeout — safely under Vercel's 30s limit
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const text = await upstream.text();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: text });
    }

    let data;
    try { data = JSON.parse(text); } catch (e) {
      return res.status(500).json({ error: 'Bad Anthropic response: ' + text.substring(0, 100) });
    }

    return res.status(200).json({ text: data?.content?.[0]?.text || '' });

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out — please retry' });
    }
    return res.status(500).json({ error: err.message });
  }
}
