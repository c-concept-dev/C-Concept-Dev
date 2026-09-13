# GPT‑5.6 Sol — protocole manuel de secours

La branche GPT‑5.6 Sol est automatisée par le proxy Cloudflare autorisé. Ce protocole reste disponible si le proxy devient indisponible.

1. Ouvrir une nouvelle conversation ChatGPT GPT‑5.6 Sol pour chaque cas.
2. Copier uniquement le champ `demande`, sans préambule ni consigne supplémentaire.
3. Conserver chaque question et chaque réponse exactement.
4. Si le modèle demande une clarification, répondre avec l’entrée correspondante de `clarification_answers`.
5. Relever heure de début, heure de fin, nombre de tours, nombre de questions et réponse finale.
6. Enregistrer la capture dans `raw/gpt56sol/<case_id>.manual.json`.
7. Laisser tokens, coût et métriques API à `N/A`.

Ne jamais remplacer GPT‑5.6 Sol par un autre modèle.
