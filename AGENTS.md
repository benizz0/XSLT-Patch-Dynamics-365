# AGENTS.md

Guide pour les agents de code (Claude Code, Codex, Copilot…) qui travaillent sur ce dépôt.
Le contexte fonctionnel est dans [README.md](README.md). Ce fichier fixe les règles.

## Le projet en une phrase

Solution Dynamics CRM (8.2 à 9.2) dont la règle Enable d'un bouton du ribbon applicatif
charge un loader. Le loader détecte l'absence de XSLT natif et injecte un fork local de
`mfreed7/xslt_polyfill` dans chaque fenêtre de l'application, popups SSRS comprises.

## Commandes

| But | Commande |
|-----|----------|
| Installer | `npm install` (terser seulement) |
| Build complet (zips 8.2, 9.1, 9.2) | `npm run build` |
| Solutions gérées | `node scripts/build.mjs --managed` |
| Build sans zip, contrôles seuls | `npm run check` |
| Tests (headless Chrome/Edge) | `npm test` |
| Banc manuel | `npm run serve` puis http://127.0.0.1:8282/ |
| Écart fork / upstream | `npm run vendor:status` (clone dans le temp de l'OS) |
| Nettoyer | `npm run clean` |
| Release (version, tag, assets) | workflow GitHub *Release*, jamais à la main |

Après **toute** modification de `src/`, `solution/` ou `vendor/` : lancer `npm test`.
Il doit afficher `AUTOTEST PASS`. Si aucun navigateur n'est disponible, lancer au moins
`npm run check` et le signaler.

## Carte du code

- `src/loader/NN-*.js` : concaténés **par ordre de nom** dans une seule IIFE
  (`00-header` ouvre, `99-footer` ferme). Ils partagent l'objet interne `X`. L'API publique
  est `bnz.XsltPatch` (`Ribbon.enable`, `Ribbon.showDiagnostics`, `diagnostics`,
  `bootstrap`, `processWindow`, `setDebug`).
  - `10-config` : options par défaut et surcharges (`window.bnzXsltPatchConfig`, `localStorage`).
  - `30-detect` : étape 1, y a-t-il du XSLT ou un besoin de polyfill ? (SSRS, Recherche
    avancée, `<?xml-stylesheet?>`, éléments XSL)
  - `40-polyfill` : étape 2, téléchargement XHR (polyfill et loader), `win.eval` dans le
    royaume cible, stub paresseux, `ensureLoaderIn` (injection d'une copie du loader).
  - `50-watch` : étapes 3 et 99 : `processWindow`/`patchDocument`, balayage,
    hook `window.open`, hook d'insertion d'iframes, propagation dans les popups,
    récupération (`reopenPopup` / reload) des pages manquées.
  - `90-ribbon` : bootstrap (délégation au royaume racine, seed, adoption par l'opener),
    diagnostic, API publique.
- `src/polyfill/prelude.js` + `postlude.js` : wrapper autour de
  `vendor/xslt_polyfill/dist/xslt-wasm.js` + `src/xslt-polyfill-src.js`. Résultat :
  `bnz_/xsltpatch/xsltpolyfill.js`.
- `solution/solution.config.json` : source de vérité (version, éditeur, langues, cibles,
  web resources).
- `solution/templates/*.xml`, `solution/ribbon/RibbonDiffXml.xml` : jetons `{{NOM}}`
  remplis par `scripts/build.mjs`. Un jeton inconnu fait échouer le build.
- `solution/reference/9.2/` : export Dynamics brut d'origine. Lecture seule, pour comparer.

## Invariants (ne pas casser)

1. **Le loader reste en ES5** : pas de `let`/`const`/`class`/`=>`/template strings/spread.
   IE11 le parse sur CRM 8.2 et doit simplement ne rien faire. Le build vérifie ce point
   grossièrement, il ne faut pas compter dessus.
2. **`bnz.XsltPatch.Ribbon.enable` ne lève jamais d'exception** et renvoie un booléen. Une
   exception dans une règle Enable casse la barre de commande de toutes les entités.
3. **Idempotence.** La règle Enable est rejouée à chaque rendu de barre de commande, et le
   loader peut être chargé dans plusieurs royaumes. L'état partagé vit dans
   `root.__bnzXsltPatchState`, les documents traités portent `__bnzXsltPatchMark`, et le
   polyfill se protège avec `__bnzXsltPolyfillLoaded`.
4. **Ne jamais écraser un `XSLTProcessor` utilisable** en mode `auto` (natif, polyfill déjà
   présent, ou shim tiers).
5. **GUID des web resources fixes** (`solution.config.json`). Les changer crée des doublons
   ou des conflits à l'import. Une nouvelle web resource reçoit un nouveau GUID, une seule fois.
   Un nom de web resource ne change pas sous le même GUID : renommer, c'est créer une nouvelle
   web resource et inscrire l'ancienne (GUID + nom) dans `retiredWebResources`, que le build
   interdit de réutiliser. Les noms se limitent à lettres, chiffres, `_`, `.` et `/` simples :
   CRM 8.2 refuse le reste à l'import (`0x8004F117`, le tiret compris). Le build le vérifie.
6. **Noms de schéma préfixés `bnz`** (éditeur `Benizz0`, préfixe d'options `75934`).
   Ids ribbon : `bnz.XsltPatch.*`.
7. **Compatibilité 8.2** : pas d'élément XML 9.x dans la cible 8.2 (voir
   `targets["8.2"].stripCustomizationNodes`). Pas d'API `Xrm` 9.x sans repli 8.x
   (voir `X.getClientUrl`).
8. **Version** : l'incrémenter pour chaque livraison et ajouter une entrée dans
   [CHANGELOG.md](CHANGELOG.md). Elle invalide le cache des web resources (`?ver=`).
9. **Propriété des hooks.** Une copie du loader ne pose de hooks (`window.open`,
   `appendChild`/`insertBefore`, `MutationObserver`, `load`) que dans les fenêtres de **son
   onglet** (`X.sameTab`). Dans une popup, on injecte une copie du loader (`propagateTo`) au lieu
   d'y poser des fonctions d'un autre royaume, qui deviendraient invalides quand ce royaume
   meurt. L'état d'un onglet appartient à la copie du royaume racine
   (`state.ownerId`).
10. **Agir sur `about:blank` tout de suite.** La `Window` initiale d'une popup ou d'une
    iframe est réutilisée par sa première navigation même origine. Le stub et la copie du
    loader doivent être posés *avant* cette navigation (`watchPopup`, `onInserted`). Ne jamais
    ignorer `about:blank` dans ces chemins.
11. **Récupération bornée.** Une page manquée est récupérée au plus une fois : drapeau
    `__bnzRecovered` sur la fenêtre rouverte, liste `bnz.xsltpatch.reloaded` dans
    `sessionStorage` pour les reloads. Sans garde disponible, on ne recharge pas.

## Fork `vendor/xslt_polyfill`

- C'est un fork local, pas un sous-module. L'origine est dans `UPSTREAM.json`.
- Un correctif qui peut rester hors du code upstream (options, wrapper, loader) va dans
  `src/polyfill/` ou `src/loader/`. C'est la règle par défaut.
- Modification d'un fichier upstream seulement si c'est inévitable. Elle doit être entourée
  de `// DYN-<nnn> begin: …` / `// DYN-<nnn> end` et avoir une entrée dans
  `vendor/xslt_polyfill/DYNAMICS_PATCHES.md`. Prendre le numéro libre suivant ;
  le backlog est en 1xx.
- Ne pas reformater ni « nettoyer » les fichiers upstream : cela rend la resynchro illisible.
- `dist/xslt-wasm.js` vient du paquet npm `xslt-polyfill` de la même version (sha256 dans
  `UPSTREAM.json`). Il ne doit être remplacé qu'au moment d'une montée de version upstream.
- Montée de version : copier la nouvelle version d'upstream, réappliquer les blocs DYN,
  remplacer `dist/xslt-wasm.js` par celui du paquet npm correspondant, mettre à jour
  `UPSTREAM.json`, puis `npm test`.

## Pièges Dynamics connus

- Les `CustomRule` du ribbon s'exécutent dans la fenêtre principale (`main.aspx`). En
  client legacy, les formulaires sont dans `contentIFrameN` : c'est pour ça que le loader
  part de la racine même origine et descend.
- UCI masque les boutons désactivés, le client legacy les grise. D'où `hideLegacyButtons`.
- Les rapports s'ouvrent via `window.open` (`/crmreports/viewer/viewer.aspx`), puis le
  ReportViewer charge des iframes.
- La Recherche avancée (`/main.aspx?pagetype=advancedfind`, iframe `/AdvancedFind/...`)
  s'ouvre en popup. En 9.2 depuis settings only, son ribbon ne se charge pas : la règle Enable
  ne s'y exécute jamais. Le patch doit venir de l'opener, par le hook `window.open` puis la
  propagation.
- Chrome 158 n'a plus du tout `XSLTProcessor`, ni dans les pages ni dans `about:blank`.
- Après la première navigation, chaque navigation crée une nouvelle `Window`. Le loader ne
  peut alors plus passer avant les scripts de la page, seulement les suivre au plus vite par
  le balayage à 25 ms.
- La glue emscripten appelle `define()` si AMD est présent. Les pages Dynamics avec
  RequireJS lèvent alors une erreur. Le wrapper masque `define`, `module` et `exports` (DYN-001).
- Le wasm est encodé dans une chaîne JS qui doit être décodée en UTF-8. Le loader passe par
  XHR + `eval` plutôt que par `<script src>` (DYN-004).
- Le langage de base de la solution (1036) doit correspondre à celui de l'org cible.

## À ne pas faire sans demande explicite

- Importer, publier ou supprimer quoi que ce soit dans une org Dynamics.
- `git push`, créer un dépôt distant, transformer le fork en sous-module.
- Changer l'éditeur, le préfixe ou le nom unique de la solution.
- Ajouter une dépendance npm runtime. Le build doit rester « Node + terser ».

## Style

- Code et commentaires de code en anglais. Docs (`README`, `DYNAMICS_PATCHES`) en français.
- 2 espaces, LF (voir `.editorconfig`). Les scripts de build sont des modules ES (`.mjs`)
  pour Node 18+.
