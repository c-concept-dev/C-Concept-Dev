# Bancs du Worker

Ce ne sont pas des contrôles de non-régression mais des **mesures**, et elles sortent de la
vérification courante pour la raison déjà consignée dans `docs/decisions.md` : elles demandent
un navigateur, un pilote système ou le moteur de Cloudflare, et un contrôle qui vacille finit
toujours par être ignoré.

Leurs résultats se lisent dans `docs/lot-e5-etape4-plan.md` §9.

## Aucun ne tourne sous le bac à sable

Tout navigateur a besoin des services Mach que le bac à sable refuse. L'échec est net et il
n'est pas un défaut du banc :

```
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer: Permission denied (1100)
Connection Invalid error for service com.apple.hiservices-xpcservice
```

## `voie-c.mjs` — la cérémonie, de bout en bout

Un authentificateur virtuel du protocole CTAP2 répond à `navigator.credentials.create()` puis à
`.get()` ; les octets rendus sont vérifiés dans Node. Chromium le porte entièrement ; WebKit et
Firefox n'ont pas d'authentificateur virtuel pilotable et s'arrêtent à la présence de l'API.

```
node apps/worker/bancs/voie-c.mjs > /tmp/voie-c.json
```

Playwright est résolu depuis `apps/app`, où il est déjà installé : le banc n'ajoute aucune
dépendance au Worker.

## `safari-livre.mjs` — le Safari livré, pas celui de Playwright

Le WebKit de Playwright est en avance sur le Safari livré, et c'est le livré qui compte. Ce banc
le pilote par `safaridriver` et s'arrête à ce qui est mesurable sans personne devant l'écran :
la présence de l'API, et la disponibilité d'un authentificateur de plateforme.

```
node apps/worker/bancs/safari-livre.mjs
```

Il ouvre une fenêtre Safari visible, et `safaridriver --enable` doit avoir été autorisé une fois.
**Il n'appelle pas `create()`** : la feuille de Touch ID s'ouvrirait et attendrait un doigt. La
cérémonie réelle sur Safari reste donc à faire, et le plan le dit plutôt que de le laisser croire.

## `workerd/` — la moitié serveur, dans le bon moteur

Node et workerd n'ont pas la même mise en œuvre de WebCrypto, et c'est workerd qui portera le
code. Ce banc reçoit `ceremonie-mesuree.json` — les octets réellement produits par la cérémonie —
et les traite comme le Worker le fera.

```
cd apps/worker/bancs/workerd
pnpm exec wrangler dev --local --config wrangler.banc.toml --port 8788 --ip 127.0.0.1
curl -X POST -H 'content-type: application/json' \
  --data-binary @../ceremonie-mesuree.json http://127.0.0.1:8788/
```

Sa configuration s'appelle `wrangler.banc.toml` et non `wrangler.toml` : wrangler ne charge
d'office que ce dernier, de sorte qu'aucun `wrangler deploy` lancé par mégarde ici ne trouve de
quoi faire. Rien n'est déployé, aucun secret n'est lu, la configuration figée est intouchée.

## `ceremonie-mesuree.json` — les octets eux-mêmes

Clé publique, données de l'authentificateur, données du client et signature, tels qu'un
authentificateur virtuel les a produits à l'origine `localhost`. **Aucune clé privée** : elle
n'a jamais quitté l'authentificateur, qui n'existe plus.

Ils servent au banc workerd, et ils serviront de fixtures aux tests de l'étape 4.4 — un vrai
jeu d'octets vaut mieux qu'un jeu inventé pour la circonstance.
