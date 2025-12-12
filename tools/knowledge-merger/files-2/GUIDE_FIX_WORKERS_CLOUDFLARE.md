# 🔧 Guide de Correction des Workers Cloudflare

## 📋 Problème Identifié

**Symptôme actuel :**
```
Incorrect API key provided: WORKER_MODE
```

**Cause :**
Les workers Cloudflare utilisent `apiKey` du body (qui contient `"WORKER_MODE"`) au lieu d'utiliser les vraies clés stockées dans les variables d'environnement.

**Code problématique dans les workers :**
```javascript
const { apiKey, payload } = await request.json();
const realKey = apiKey || env.PROVIDER_API_KEY; // ❌ utilise apiKey du body !
```

**Avec `apiKey: "WORKER_MODE"`, cela donne :**
- `realKey = "WORKER_MODE"` (au lieu de `env.PROVIDER_API_KEY`)
- L'API du provider reçoit `Authorization: Bearer WORKER_MODE`
- Erreur 401 "Incorrect API key"

---

## ✅ Solution

Les workers doivent **TOUJOURS** utiliser les clés des variables d'environnement, **JAMAIS** celles du body :

```javascript
// ❌ AVANT (mauvais)
const realKey = apiKey || env.PROVIDER_API_KEY;

// ✅ APRÈS (correct)
const realKey = env.PROVIDER_API_KEY;
```

---

## 🔧 Corrections à Appliquer

### 1️⃣ Worker OpenAI (`openai-proxy.11drumboy11.workers.dev`)

**Localisation :** Cloudflare Dashboard → Workers & Pages → `openai-proxy`

**Code complet corrigé :**

```javascript
export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { apiKey, payload } = body || {};

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Missing payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { provider = 'openai', model, messages, max_tokens, temperature } = payload;

    // ✅ FIX: Toujours utiliser la clé du worker (env), jamais celle du body
    const openaiKey = env.OPENAI_API_KEY;

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured in worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (provider !== 'openai') {
      return new Response(JSON.stringify({ error: 'Unsupported provider in this worker' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call OpenAI API
    const upstreamRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature
      })
    });

    const responseText = await upstreamRes.text();

    return new Response(responseText, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
```

**Variable d'environnement requise :**
- Nom : `OPENAI_API_KEY`
- Valeur : Votre vraie clé OpenAI (commence par `sk-proj-...`)

---

### 2️⃣ Worker Anthropic (`ocr-universel-proxy.11drumboy11.workers.dev`)

**Localisation :** Cloudflare Dashboard → Workers & Pages → `ocr-universel-proxy`

**Code complet corrigé :**

```javascript
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { apiKey, payload } = body || {};

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Missing payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { provider = 'anthropic', model, messages, max_tokens, temperature } = payload;

    // ✅ FIX: Toujours utiliser la clé du worker (env), jamais celle du body
    const anthropicKey = env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key not configured in worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (provider !== 'anthropic') {
      return new Response(JSON.stringify({ error: 'Unsupported provider in this worker' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Anthropic API
    const upstreamRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature
      })
    });

    const responseText = await upstreamRes.text();

    return new Response(responseText, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
```

**Variable d'environnement requise :**
- Nom : `ANTHROPIC_API_KEY`
- Valeur : Votre vraie clé Anthropic (commence par `sk-ant-...`)

---

### 3️⃣ Worker Google/Gemini (`gemini-proxy.11drumboy11.workers.dev`)

**Localisation :** Cloudflare Dashboard → Workers & Pages → `gemini-proxy`

**Code complet corrigé :**

```javascript
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { apiKey, payload } = body || {};

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Missing payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { provider = 'google', model, messages, max_tokens, temperature } = payload;

    // ✅ FIX: Toujours utiliser la clé du worker (env), jamais celle du body
    const googleKey = env.GOOGLE_API_KEY;

    if (!googleKey) {
      return new Response(JSON.stringify({ error: 'Google API key not configured in worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (provider !== 'google') {
      return new Response(JSON.stringify({ error: 'Unsupported provider in this worker' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Convert messages to Gemini format
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Call Google Gemini API
    const upstreamRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: temperature || 0.3,
            maxOutputTokens: max_tokens || 16000
          }
        })
      }
    );

    const responseText = await upstreamRes.text();

    return new Response(responseText, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
```

**Variable d'environnement requise :**
- Nom : `GOOGLE_API_KEY`
- Valeur : Votre vraie clé Google AI Studio

---

### 4️⃣ Worker Groq (`groq-proxy.11drumboy11.workers.dev`)

**Localisation :** Cloudflare Dashboard → Workers & Pages → `groq-proxy`

**Code complet corrigé :**

```javascript
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { apiKey, payload } = body || {};

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Missing payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { provider = 'groq', model, messages, max_tokens, temperature } = payload;

    // ✅ FIX: Toujours utiliser la clé du worker (env), jamais celle du body
    const groqKey = env.GROQ_API_KEY;

    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'Groq API key not configured in worker' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (provider !== 'groq') {
      return new Response(JSON.stringify({ error: 'Unsupported provider in this worker' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Groq API
    const upstreamRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens,
        temperature
      })
    });

    const responseText = await upstreamRes.text();

    return new Response(responseText, {
      status: upstreamRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
```

**Variable d'environnement requise :**
- Nom : `GROQ_API_KEY`
- Valeur : Votre vraie clé Groq

---

## 📝 Procédure de Déploiement

### Pour Chaque Worker

1. **Accéder au Dashboard Cloudflare**
   - https://dash.cloudflare.com
   - Workers & Pages

2. **Sélectionner le Worker**
   - Cliquer sur le nom du worker (ex: `openai-proxy`)

3. **Éditer le Code**
   - Bouton "Quick Edit" ou "Edit Code"
   - Remplacer tout le code par la version corrigée ci-dessus

4. **Configurer la Variable d'Environnement**
   - Onglet "Settings" → "Variables and Secrets"
   - Add variable:
     - **OpenAI** : `OPENAI_API_KEY` = `sk-proj-...`
     - **Anthropic** : `ANTHROPIC_API_KEY` = `sk-ant-...`
     - **Google** : `GOOGLE_API_KEY` = `AIza...`
     - **Groq** : `GROQ_API_KEY` = `gsk_...`
   - Type: **Secret** (encrypted)

5. **Déployer**
   - Bouton "Save and Deploy"
   - Attendre confirmation (~10 secondes)

6. **Tester**
   - Utiliser curl ou votre HTML
   - Vérifier que l'erreur "WORKER_MODE" disparaît

---

## 🧪 Tests de Validation

### Test Curl Rapide

#### OpenAI
```bash
curl -X POST https://openai-proxy.11drumboy11.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "WORKER_MODE",
    "payload": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "max_tokens": 100,
      "temperature": 0.3,
      "messages": [{"role": "user", "content": "Say hello"}]
    }
  }'
```

**Résultat attendu :** JSON avec `choices[0].message.content` contenant "hello"

#### Anthropic
```bash
curl -X POST https://ocr-universel-proxy.11drumboy11.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "WORKER_MODE",
    "payload": {
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 100,
      "temperature": 0.3,
      "messages": [{"role": "user", "content": "Say hello"}]
    }
  }'
```

#### Google
```bash
curl -X POST https://gemini-proxy.11drumboy11.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "WORKER_MODE",
    "payload": {
      "provider": "google",
      "model": "gemini-2.0-flash-exp",
      "max_tokens": 100,
      "temperature": 0.3,
      "messages": [{"role": "user", "content": "Say hello"}]
    }
  }'
```

#### Groq
```bash
curl -X POST https://groq-proxy.11drumboy11.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "WORKER_MODE",
    "payload": {
      "provider": "groq",
      "model": "llama-3.3-70b-versatile",
      "max_tokens": 100,
      "temperature": 0.3,
      "messages": [{"role": "user", "content": "Say hello"}]
    }
  }'
```

---

## ✅ Checklist de Vérification

- [ ] Worker OpenAI déployé avec variable `OPENAI_API_KEY`
- [ ] Worker Anthropic déployé avec variable `ANTHROPIC_API_KEY`
- [ ] Worker Google déployé avec variable `GOOGLE_API_KEY`
- [ ] Worker Groq déployé avec variable `GROQ_API_KEY`
- [ ] Test curl OpenAI réussi
- [ ] Test curl Anthropic réussi
- [ ] Test curl Google réussi
- [ ] Test curl Groq réussi
- [ ] Test HTML avec Mode Worker activé
- [ ] Aucune erreur "WORKER_MODE" dans les logs

---

## 🎯 Points Clés à Retenir

1. **Ne JAMAIS utiliser `apiKey` du body pour appeler les APIs**
   ```javascript
   // ❌ const key = apiKey || env.KEY;
   // ✅ const key = env.KEY;
   ```

2. **Les vraies clés DOIVENT être dans les variables d'environnement Cloudflare**

3. **Le dummy `"WORKER_MODE"` du HTML n'est jamais utilisé par les workers**

4. **Chaque worker gère UN SEUL provider**

5. **Les CORS headers sont essentiels** pour permettre les appels depuis le navigateur

---

**Date:** 10 décembre 2025  
**Version:** Workers V2.0 (API Key Fix)  
**Auteurs:** Claude + ChatGPT (diagnostic collaboratif)
