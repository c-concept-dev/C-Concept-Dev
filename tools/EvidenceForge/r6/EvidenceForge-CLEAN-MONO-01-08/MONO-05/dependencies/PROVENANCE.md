# Provenance — MONO-04 (copie gelée, nesting MONO-03/02/01.x)

**MISE À JOUR REBASE R1** (régression MONO02-CORPUS-BY-REF-MAP, rebase de
dépendance uniquement — aucun changement de code dans MONO-05 lui-même) :
copie intégrale et bytewise de MONO-04-R1 (manifeste 225/225, tests
69/69, inchangé), qui contient elle-même MONO-03-R1 (189/189, 64/64,
inchangé) et MONO-02-R1 (152/152, 334/334, correctif appliqué) et
MONO-01.x (106/106, 172/172, inchangé).
MONO-05 est un CLIENT du système : `app/server/operator-api.js` compose
`createMono01`/`createOrchestrationEngine`/`createMono03`/`createMono04`
exactement comme n'importe quel autre appelant — il ne réimplémente ni ne
modifie rien de gelé. Le navigateur (`app/client/`) n'a JAMAIS d'accès
direct à ces modules : il ne parle qu'à `OperatorApi` par HTTP, qui est la
seule frontière ayant accès aux ports/backends/secrets.

Vérification effectuée au moment de la copie :
`sha256sum -c manifest/SHA256SUMS` → **36/36 OK** (MONO-04),
**187/187 OK** (MONO-03), **44/44 OK** (MONO-02), **106/106 OK** (MONO-01.x).
