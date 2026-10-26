/* Relais Cloudflare Worker (facultatif) : garde la clé Anthropic côté serveur.
   L'app envoie la requête ici au lieu d'api.anthropic.com ; le relais ajoute la clé et renvoie la réponse.

   Mise en place (5 minutes) :
   1. dash.cloudflare.com → Workers & Pages → Create → Worker → coller ce fichier → Deploy.
   2. Onglet Settings → Variables and Secrets → ajouter le secret ANTHROPIC_API_KEY (la clé sk-ant-…).
      Facultatif : ALLOWED_ORIGIN = https://notes-de-frais.pages.dev (l'adresse de l'app) pour refuser les autres sites.
   3. Copier l'adresse du worker (https://….workers.dev) dans l'app : Réglages → Relais.
*/
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN.split(',').map(s => s.trim()) : null;
    const corsOrigin = allowed ? (allowed.includes(origin) ? origin : allowed[0]) : (origin || '*');
    const cors = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('Méthode non autorisée', { status: 405, headers: cors });
    if (allowed && !allowed.includes(origin)) return new Response('Origine refusée', { status: 403, headers: cors });
    if (!env.ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY manquante sur le relais' } }), { status: 500, headers: { ...cors, 'content-type': 'application/json' } });

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: await request.text()
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'content-type': upstream.headers.get('content-type') || 'application/json' }
    });
  }
};
