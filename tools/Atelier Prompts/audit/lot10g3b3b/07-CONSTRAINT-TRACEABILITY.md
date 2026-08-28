# Traçabilité des contraintes

## Chaîne canonique

```text
contrainte utilisateur
→ intent.explicit_constraints[REQ-nnn]
→ obligations[OBL-nnn].constraint_id = REQ-nnn
→ quantities[Q-nnn].obligation_ids
→ locks[].source_ids
→ checks[].obligation_ids
```

## Exemple vérifié

```text
« exactement 20 éléments »
→ REQ-001
→ OBL-001, obligatoire, source=user, constraint_id=REQ-001
→ Q-001 {exact:20, unit:"éléments", obligation_ids:[OBL-001]}
→ verrou volume, source_ids=[REQ-001]
→ CHK-001 count exact, obligation_ids=[OBL-001]
```

## Stabilité

- Les contraintes sont numérotées dans leur ordre runtime : `REQ-001`, `REQ-002`, etc.
- Les obligations utilisent `OBL-*`, quantités `Q-*`, contrôles `CHK-*`, hypothèses `ASM-*`, manques `MISS-*`.
- La validation refuse une contrainte sans obligation utilisateur de même texte et référence.
- Une quantité ne peut exister sans borne numérique et unité ou cible.

## Limite shadow assumée

Le builder ne découvre pas de nouvelles contraintes dans la prose. Si le runtime source ne fournit qu'une demande brute, celle-ci reste intégralement dans `original_request`; l'extraction structurée viendra d'un état existant ou d'un futur adapter, sans heuristique métier dans le contrat.
