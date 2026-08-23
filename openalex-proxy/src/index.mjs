// ============================================================================
// WORKER OPENALEX PROXY - Relais generique vers l'API OpenAlex (catalogue
// academique ouvert). Injecte la cle API cote serveur pour que des outils
// web statiques (HTML/JS sans backend) puissent interroger OpenAlex sans
// jamais exposer la cle au navigateur.
//
// Usage : reproduit tel quel le chemin + les query params de l'API OpenAlex
// officielle (https://api.openalex.org), en ajoutant la cle.
//   GET /works?search=quantum+computing         -> /works?search=...&api_key=...
//   GET /works/W2741809807                      -> /works/W2741809807?api_key=...
//   GET /authors?filter=works_count:%3E100       -> idem
// Generique : ne connait aucun projet ni logique metier particuliere.
// ============================================================================

const OPENALEX_BASE = 'https://api.openalex.org';

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!env.OPENALEX_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAlex key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const incoming = new URL(request.url);
      const target = new URL(incoming.pathname + incoming.search, OPENALEX_BASE);
      target.searchParams.set('api_key', env.OPENALEX_API_KEY);

      const response = await fetch(target.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      const body = await response.text();

      return new Response(body, {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }
};
