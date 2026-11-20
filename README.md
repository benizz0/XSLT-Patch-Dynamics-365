# XSLT Patch pour Dynamics CRM 8.2 → 9.2

Chrome retire le support natif de XSLT (`XSLTProcessor`, `<?xml-stylesheet?>`).
Dynamics CRM 8.2 à 9.2 (on-premise et online, client web legacy comme UCI) contient
encore du code qui s'en sert, en particulier autour des rapports SSRS. Les extensions
navigateur existantes ne couvrent pas tous les cas : iframes, popups, pages de rapport.

Cette solution Dynamics injecte un polyfill XSLT dans les fenêtres de l'application, sans
extension ni poste à configurer. Le polyfill est un fork local de
[mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill) (libxslt + libxml2
compilés en WebAssembly) avec des correctifs propres à Dynamics.

## Installation

Télécharger la solution depuis la **[dernière release](https://github.com/benizz0/XSLT-Patch-Dynamics-365/releases/latest)**.

Chaque release publie une solution gérée par version de Dynamics, nommée
`XSLT_Patch_<version>_crm<cible>_managed.zip`. La version y est écrite avec des `_`
(`1_0_0_10` pour `1.0.0.10`), et `crm<cible>` donne la version de Dynamics sans le point :

| Asset | Pour |
|-------|------|
| `..._crm82_managed.zip` | CRM 8.2 |
| `..._crm91_managed.zip` | Dynamics 9.0 et 9.1 on-premise |
| `..._crm92_managed.zip` | Dynamics 9.0 à 9.2, online et on-premise |

Le paquet `crm82` s'importe aussi en 9.x, mais sans le bouton de la barre globale UCI :
en 9.x, prendre `crm91` ou `crm92`.

1. Paramètres > Solutions > Importer, choisir le zip de la bonne cible.
2. Publier toutes les personnalisations.
3. Vérifier : ouvrir une grille, puis lancer un rapport. Dans la console (F12) :
   `bnz.XsltPatch.diagnostics()`.

La langue de base de la solution est 1036 (français). Pour une org dont la langue de base
est différente, changer `baseLanguage` dans `solution/solution.config.json` et
[construire la solution](#construire-la-solution).

## Fonctionnement

Un bouton « XSLT Patch » est ajouté au ribbon applicatif : grilles, formulaires et
sous-grilles de toutes les entités, Recherche avancée, pages sans entité (`BasicHomeTab`) et
barre globale UCI (paquets 9.x seulement : elle n'existe pas en 8.2). Le bouton ne sert presque à rien. Ce qui compte, c'est sa **règle Enable**
(`CustomRule`) : Dynamics l'évalue chaque fois qu'une barre de commande s'affiche, et c'est
elle qui lance le patch.

1. **Détection.** La règle appelle `bnz.XsltPatch.Ribbon.enable`. Le loader remonte à la
   fenêtre racine (même origine) puis parcourt chaque fenêtre accessible. Pour chacune, il
   vérifie si un `XSLTProcessor` fonctionne, et s'il y a du XSLT dans la page : instruction
   `<?xml-stylesheet?>`, éléments dans l'espace de noms XSL, URL de rapport SSRS.
2. **Chargement du fork.** S'il manque un `XSLTProcessor` utilisable :
   - page avec du XSLT ou page de rapport : le polyfill (`bnz_/xsltpatch/xsltpolyfill.js`,
     environ 1,4 Mo) est téléchargé une fois puis exécuté dans la fenêtre ;
   - sinon, le loader installe un **stub paresseux**. Le premier `new XSLTProcessor()`
     télécharge et installe le vrai polyfill de façon synchrone. Une page qui n'utilise
     jamais XSLT ne paie donc rien.
3. **Polyfill.** `window.XSLTProcessor` est remplacé dans la fenêtre (son propre royaume
   JS). Le code Dynamics existant fonctionne sans modification.
4. **Surveillance (« 99 »).**
   - `window.open` est intercepté dans chaque fenêtre de l'onglet. La popup reçoit le stub et
     une copie du loader **tant qu'elle est encore sur `about:blank`**. Le navigateur réutilise
     cette `Window` pour la première page chargée, qui voit donc le patch dès son premier script.
     La copie suit ensuite la popup, ses iframes et ses propres popups, même si le ribbon de la
     popup ne charge jamais. Cela couvre UCI → Paramètres avancés → Recherche avancée.
   - Les iframes sont suivies de trois façons : hook `appendChild`/`insertBefore` (stub
     synchrone avant navigation), `MutationObserver` et événement `load`.
   - Un balayage de tout l'arbre de fenêtres tourne en continu : 25 ms après une ouverture,
     400 ms le reste du temps.
   - Une Recherche avancée trouvée **déjà chargée** sans XSLT est rouverte une fois par son
     opener, cette fois sous surveillance dès `about:blank`.
   - Une feuille de style `/_static/css/<langue>/…` en 404 (cas de `cui.css` en 1036 sur
     online) est doublée par sa copie 1033 : sans elle, le ribbon legacy sort en texte brut.

La règle Enable renvoie `false`, donc le bouton est masqué en UCI. Dans le client web
legacy, où un bouton désactivé reste visible, le loader le cache. En mode diagnostic, le
bouton s'active et affiche l'état du patch.

## Structure

```text
.
├─ solution/
│  ├─ solution.config.json   # nom, version, éditeur (bnz), langues, cibles 8.2/9.1/9.2, web resources (GUID fixes)
│  ├─ templates/             # Solution.xml, Customizations.xml (avec jetons {{...}})
│  ├─ ribbon/RibbonDiffXml.xml  # ribbon applicatif : bouton, commande, règle Enable
│  └─ reference/9.2/         # export brut d'origine (base des métadonnées)
├─ src/
│  ├─ loader/                # loader, en ES5 ; concaténé dans l'ordre des noms -> bnz_/xsltpatch/loader.js
│  └─ polyfill/              # wrapper Dynamics autour du fork (prelude/postlude)
├─ vendor/xslt_polyfill/     # fork local d'upstream (+ dist/xslt-wasm.js, glue emscripten)
│  ├─ UPSTREAM.json          # commit et version d'origine
│  └─ DYNAMICS_PATCHES.md    # correctifs appliqués et backlog
├─ scripts/                  # build, zip, serveur de test, autotest, release, état du fork
├─ .github/workflows/        # CI (tests) et Release (tag + solutions gérées)
├─ test/harness/             # banc de test sans Dynamics (Xrm simulé, iframe, SSRS, Recherche avancée)
├─ CHANGELOG.md              # historique des versions de la solution
├─ build/                    # (généré) web resources prêtes
└─ dist/                     # (généré) solutions .zip + version dépliée par cible
```

## Prérequis

- Node.js 18 ou plus récent (testé avec Node 24).
- Pour `npm test` : Chrome ou Edge installé (sinon, renseigner `BROWSER=<chemin>`).
- Pas besoin d'emscripten : la glue WASM est versionnée dans le fork. Il ne faut
  recompiler libxslt que pour modifier `src/transform.c`, voir le README du fork.

## Construire la solution

```powershell
npm install
npm run build              # dist/XSLT_Patch_<version>_crm82.zip, ..._crm91.zip, ..._crm92.zip
npm run build:82           # une seule cible
node scripts/build.mjs --version 1.0.1.0
node scripts/build.mjs --managed           # solutions gérées (..._managed.zip)
npm run build:dev          # polyfill non minifié (debug)
.\scripts\build.ps1 -Target 8.2 -Version 1.0.1.0   # équivalent PowerShell
```

| Cible | Pour | Différences |
|-------|------|-------------|
| `8.2` | CRM 8.2 (et importable en 9.x) | `SolutionPackageVersion="8.2"`, sans `behavior` sur les RootComponents, sans `CustomControls` ni `EntityDataProviders`, sans `OrganizationVersion`/`OrganizationSchemaType` sur la racine de `customizations.xml`, sans le bouton de la barre globale UCI (`Mscrm.GlobalTab`). Importé en 9.x, il ne couvre donc pas la barre globale UCI : préférer le paquet 9.x |
| `9.1` | 9.0 et 9.1 on-premise | comme `9.2`, avec `SolutionPackageVersion="9.1"` |
| `9.2` | 9.0 à 9.2, online et on-premise | métadonnées identiques à l'export de référence |

Par défaut, la solution est **non gérée**. `--managed` produit une solution **gérée**
(`<Managed>1</Managed>`, suffixe `_managed`). Ce sont celles publiées dans les releases
GitHub. Une solution gérée ne s'exporte pas et se désinstalle d'un bloc ; elle n'a pas
encore été importée dans une org réelle.

**Avant chaque livraison, incrémenter la version** (`solution.config.json` ou `--version`)
et compléter [CHANGELOG.md](CHANGELOG.md). La version sert de cache-buster (`?ver=`) pour les
web resources. CRM 8.2 répond 500 à un `ver` non entier : le loader du paquet 8.2 envoie la
version sous forme d'entier (`1.0.0.10` donne `1000010`, clé de cible
`webResourceVerFormat`).

Une solution construite localement s'importe comme indiqué dans [Installation](#installation).

## Configuration et diagnostic

Le comportement par défaut se règle dans `src/loader/10-config.js`. Il peut être surchargé
sans redéployer, poste par poste, via `localStorage` (même origine que l'org) :

```js
// Console F12 sur l'org (dans la fenêtre concernée, ex. la popup Recherche avancée)
copy(bnz.XsltPatch.report());   // rapport JSON (fenêtres, erreurs XSLT, includes) dans le presse-papiers
bnz.XsltPatch.setDebug(true);   // logs + bouton visible, à recharger
localStorage.setItem('bnz.xsltpatch.config', JSON.stringify({ mode: 'off' }));  // coupe-circuit
localStorage.removeItem('bnz.xsltpatch.config');
```

| Clé | Défaut | Effet |
|-----|--------|-------|
| `mode` | `auto` | `auto` : polyfill seulement si `XSLTProcessor` manque ou est cassé. `always` : partout (tests). `off` : ne fait rien. |
| `debug` | `false` | Logs console `[bnz.XsltPatch]`. |
| `showButton` | `false` | Active le bouton de diagnostic. |
| `watchFrames`, `watchPopups` | `true` | Suivi des iframes et des `window.open`. |
| `propagateToPopups` | `true` | Copie du loader évaluée dans chaque popup suivie. |
| `adoptOpener` | `true` | Une popup amorcée tardivement se confie à son opener, qui peut la rouvrir. |
| `prefetch` | `true` | Préchargement du polyfill en arrière-plan au démarrage. |
| `ssrsUrlPatterns` | `/crmreports/`, `reserved.reportviewerwebcontrol.axd`, `/reportserver` | URLs qui reçoivent le polyfill immédiatement. |
| `advancedFindUrlPatterns` | `pagetype=advancedfind`, `/advancedfind/` | Idem, pour la Recherche avancée. |
| `reloadIfMissedPatterns` | idem Recherche avancée | Pages rouvertes ou rechargées une fois si elles ont été chargées avant le patch. |
| `sweepFastMs` / `sweepSlowMs` / `burstMs` | 25 / 400 / 15000 | Rythme du balayage des fenêtres. |
| `cssFallbackLcid` | `'1033'` | Langue de repli pour une feuille de style en 404 (`''` : désactivé). |
| `cssFallbackPatterns` | `/_static/css/` | Préfixes d'URL suivis d'un segment de langue, concernés par le repli (ex. `cui.css`, ribbon legacy). |

## Tester sans Dynamics

```powershell
npm test          # build --check puis autotest headless (Chrome/Edge)
npm run serve     # http://127.0.0.1:8282/ : banc de test manuel
```

Le banc supprime `XSLTProcessor` pour simuler Chrome sans XSLT. Les Chrome récents, 158 par
exemple, n'ont de toute façon plus XSLT. Il fournit aussi un faux `Xrm` et un faux `define`
AMD (comme RequireJS). Les cas vérifiés :

- stub paresseux dans la fenêtre principale ;
- iframe ajoutée dynamiquement ;
- popup `/crmreports/viewer/` ;
- Recherche avancée (`main.aspx?pagetype=advancedfind` avec une iframe `AdvFind.aspx` qui
  appelle XSLT pendant le parsing) ;
- chaîne settings only → Recherche avancée ;
- récupération d'une Recherche avancée ouverte à l'insu du patch ;
- `cui.css` du ribbon legacy en 404 dans la langue de l'utilisateur, remplacée par la copie 1033.

L'historique des versions est dans [CHANGELOG.md](CHANGELOG.md). Ce banc ne remplace pas un
test sur une org réelle, 8.2 comme 9.2.

## Limites connues

- **Première navigation seulement.** La réutilisation de `about:blank` ne vaut que pour la
  première navigation d'une popup ou d'une iframe. Les navigations suivantes (lien, reload,
  iframe dont on change `src`) dépendent du balayage à 25 ms. Une page qui appelle XSLT dès le
  `<head>` peut alors passer avant le patch.
- Une Recherche avancée ouverte depuis une fenêtre où le loader n'a jamais tourné, et dont le
  ribbon ne charge pas, n'est pas corrigée. Exemple : un onglet settings only ouvert par URL
  directe, sur une page sans barre de commande.
- Les popups ouvertes avec `noopener` ne sont pas suivies.
- `document()` ne marche pas dans les appels synchrones (backlog DYN-101). `xsl:include` et
  `xsl:import` sont résolus par XHR synchrone et recopiés dans la feuille (DYN-006).
  `xsl:apply-imports` n'a alors plus rien à appliquer.
- Une CSP sans `'wasm-unsafe-eval'` bloque le polyfill.
- Le reste des limites upstream s'applique : voir `vendor/xslt_polyfill/README.md`.

Les correctifs Dynamics (appliqués et prévus) sont listés dans
[vendor/xslt_polyfill/DYNAMICS_PATCHES.md](vendor/xslt_polyfill/DYNAMICS_PATCHES.md).

## Licences

- Code de ce dépôt : BSD-3-Clause ([LICENSE](LICENSE)).
- `vendor/xslt_polyfill` : fork local de
  [mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill) (version et commit dans
  [UPSTREAM.json](vendor/xslt_polyfill/UPSTREAM.json)). BSD-3-Clause, © 2025 Mason Freed
  ([LICENSE](vendor/xslt_polyfill/LICENSE)).
- `vendor/xslt_polyfill/dist/xslt-wasm.js` : repris du paquet npm
  [xslt-polyfill](https://www.npmjs.com/package/xslt-polyfill) de la même version, même licence.
- [libxml2](https://gitlab.gnome.org/GNOME/libxml2) et
  [libxslt](https://gitlab.gnome.org/GNOME/libxslt) (projets GNOME, embarqués dans le WASM) :
  licence MIT.
- [Emscripten](https://github.com/emscripten-core/emscripten) (glue JavaScript du WASM) :
  licence MIT / University of Illinois NCSA.
- [terser](https://github.com/terser/terser) (minification au build, non livré) :
  BSD-2-Clause.
