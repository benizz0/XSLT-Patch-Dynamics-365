# Changelog

Toutes les versions de la solution Dynamics `XSLT_Patch`. Le numéro est celui de la solution
(`solution/solution.config.json`) ; il sert aussi de cache-buster pour les web resources.

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Modifié

- **Lisibilité : renommage des noms internes**, sans changement de comportement. Fonctions
  du loader (`X.upgradeIfEager` devient `X.upgradeToEagerIfNeeded`, `X.reloadIfMissed`
  devient `X.recoverIfMissed`, `X.adoptOpener` devient `X.handOverToOpener`, `X.burst`
  devient `X.startFastSweep`, `X.loadSync`/`X.loadAsync` deviennent
  `X.downloadSync`/`X.downloadAsync`…), variables locales d'une lettre ou ambiguës dans le
  loader, le wrapper du polyfill, `scripts/build.mjs` et le banc de test.
  Rien de ce qui passe d'un royaume ou d'une version à l'autre n'est renommé : API publique
  `bnz.XsltPatch.*`, clés de configuration, marqueurs `__bnz*`, champs de l'état partagé et
  de la marque de document (`mark.action` et ses valeurs), champs JSON de `report()`.
  Le champ `nativeUsable` du rapport garde son nom ; il vaut vrai aussi quand le polyfill
  ou un shim tiers est présent (commentaire ajouté dans le code).

### Corrigé

- **Recherche avancée manquée : la popup disparaissait si sa réouverture était bloquée (#1).**
  La récupération fermait la fenêtre avant d'ouvrir sa remplaçante. Quand le navigateur
  refusait `window.open` (bloqueur de popups, récupération lancée hors activation
  utilisateur), la fenêtre était fermée sans remplacement. `X.reopenPopup` ouvre désormais
  la remplaçante d'abord, sous un nom temporaire unique (le nom d'origine ferait naviguer la
  fenêtre existante au lieu d'en créer une neuve), ferme l'ancienne, puis donne son nom à la
  nouvelle. Si l'ouverture est refusée, ou si l'ancienne fenêtre ne peut pas être fermée, rien
  n'est fermé, la marque du document n'est pas engagée et le loader passe au rechargement
  borné (garde `bnz.xsltpatch.reloaded` dans `sessionStorage`).
- **Récupération au plus une fois, aussi après un rechargement de repli.** `X.recoverIfMissed`
  lit la garde de rechargement avant de tenter une réouverture : une popup rechargée parce
  que sa réouverture était bloquée n'est plus rouverte à son échec suivant.
- **Précédence `xsl:import` (DYN-006, #5).** L'aplatissement des imports ne gardait que le
  départage à priorité égale : un template importé avec `priority="10"` l'emportait sur la
  règle locale. Les règles reçoivent désormais une priorité explicite qui compare la précédence
  d'import avant la priorité, imports successifs et imbriqués compris. Les templates nommés et
  les variables globales sont départagés de la même façon, par nom étendu (URI + nom local) ;
  un template `name` + `match` écrasé par son nom garde sa règle `match`.

## [1.0.0.10] - 2026-11-19

Correctif d'exécution CRM 8.2 : le paquet 1.0.0.9 s'importait, mais le loader n'arrivait pas
à télécharger le polyfill. Polyfill inchangé. Paquets 9.1 et 9.2 : même comportement qu'en
1.0.0.9, seul le numéro de version change.

### Corrigé

- **CRM 8.2 : `polyfill download failed: HTTP 500` (#13).** Le loader télécharge le polyfill
  (et sa propre copie, pour les popups) par des URL qu'il construit lui-même :
  `<clientUrl>/WebResources/<nom>?ver=<version>`. CRM 8.2 répond 500 quand `ver` n'est pas
  un entier (`?ver=1.0.0.9`), alors que la même URL sans `ver` ou avec `?ver=1009` répond 200.
  Le loader du paquet 8.2 envoie désormais la version sous forme d'entier :
  `?ver=1000010` pour 1.0.0.10.

### Ajouté

- **Build : format du cache-buster par cible.** Clé de cible `webResourceVerFormat` dans
  `solution.config.json` :
  - `"version"` (défaut) : la version de la solution telle quelle (`1.0.0.10`).
  - `"integer"` : `a.b.c.d` devient `a*1000000 + b*10000 + c*100 + d`. Le build échoue si
    `b`, `c` ou `d` vaut 100 ou plus, ou si le résultat dépasse un Int32.

  Seule la cible 8.2 utilise `"integer"`. Le loader devient donc propre à chaque paquet : le
  zip 8.2 contient sa propre copie, `build/webresources/` garde celle des cibles 9.x. Le build
  vérifie que chaque paquet embarque le loader au bon format.

### Mise à niveau

- **CRM 8.2** : importer le paquet 8.2 par-dessus 1.0.0.9 puis publier. Aucun nettoyage de
  cache n'est nécessaire : le nouveau `ver` diffère de tous ceux envoyés jusqu'ici.
- **9.x** : mise à jour normale depuis 1.0.0.9 avec le paquet 9.1 ou 9.2. Le paquet 8.2 importé
  en 9.x devrait aussi fonctionner (Dynamics y envoie lui-même des `ver` entiers), mais ce
  cas n'a pas été testé.

### Limites restantes

- Vérifié par le build et le banc headless (28 cas), qui sert le loader au format 9.x et ne
  simule pas le refus de CRM 8.2. Sur l'org 8.2 de #13, seul un test manuel d'URL
  (`?ver=1009`) a été fait ; un import réel du paquet 1.0.0.10 reste à faire.
- Le segment de cache `/{<horodatage>}/` que Dynamics insère avant `WebResources` n'est
  toujours pas repris : #13 montre que l'URL sans ce segment répond bien en 8.2.

## [1.0.0.9] - 2026-11-19

Correctif d'import CRM 8.2 : le package 8.2 de 1.0.0.8 était refusé à l'étape des rubans de
l'application. Loader et polyfill inchangés. Paquets 9.1 et 9.2 : même contenu qu'en
1.0.0.8, seul le numéro de version change.

### Corrigé

- **Import refusé sur CRM 8.2 : dépendance vers `Mscrm.GlobalTab.New.Controls` (#11).**
  La barre de commande globale (`Mscrm.GlobalTab`) n'existe qu'en UCI. CRM 8.2 ne la connaît
  pas et refusait `bnz.XsltPatch.CustomAction.Global` (`0x8004F107`). Le paquet 8.2 ne
  contient plus cette CustomAction. Les cinq autres (grilles, formulaires, sous-grilles,
  Recherche avancée, `BasicHomeTab`) restent, et ce sont elles qui chargent le loader en
  client legacy. Le bouton Global ne s'y affichait de toute façon jamais.

### Ajouté

- **Build : emplacements de ribbon par cible.** Deux clés de cible dans
  `solution.config.json` :
  - `excludeRibbonCustomActions` : CustomActions retirées du paquet de la cible. Chaque id
    doit exister dans `RibbonDiffXml.xml`, sinon le build échoue.
  - `forbiddenRibbonLocations` : racines d'emplacement interdites. Le build échoue si le
    ribbon généré y fait encore référence (commentaires ignorés).

  La cible 8.2 retire `bnz.XsltPatch.CustomAction.Global` et interdit `Mscrm.GlobalTab`. Le
  build échoue aussi s'il ne reste plus aucune CustomAction pour charger le loader.
  `RibbonDiffXml.xml` reste la source unique, le filtrage se fait au build.

### Mise à niveau

- **CRM 8.2** : aucune version publiée ne s'importait jusqu'ici (1.0.0.6 à 1.0.0.8, voir #7,
  #9, #11). 1.0.0.9 s'installe comme une première installation.
- **9.x** : utiliser le paquet 9.1 ou 9.2, mise à jour normale depuis 1.0.0.8. Le paquet 8.2
  s'importe aussi en 9.x, mais sans le bouton de la barre globale UCI : sur UCI, le loader ne
  se charge alors qu'à l'affichage d'une grille, d'un formulaire ou d'une autre barre de
  commande couverte.

### Limites restantes

- Correctif vérifié par le build et le banc headless (28 cas), pas encore par un import réel
  sur une org CRM 8.2. Le journal de #11 ne cite que cette dépendance ; un autre emplacement
  absent en 8.2 ferait échouer l'import de la même façon et s'ajouterait à
  `forbiddenRibbonLocations`.
- Page d'accueil legacy (tableau de bord, `Mscrm.DashboardTab`) toujours sans bouton : le
  loader s'amorce à la première grille, au premier formulaire ou à la première page
  `BasicHomeTab` affichée.

## [1.0.0.8] - 2026-11-19

Correctif d'import CRM 8.2 : le package 1.0.0.7 était refusé à l'import de la web resource
du polyfill. Comportement du loader et du polyfill inchangé : seuls le nom et le GUID de la
web resource du polyfill changent.

### Corrigé

- **Import refusé sur CRM 8.2 : nom de web resource `xslt-polyfill.js` (#9).** CRM 8.2
  n'accepte dans un nom de web resource que lettres, chiffres, points et barres obliques
  non consécutives (plus le `_` du préfixe) : l'import s'arrêtait sur
  `bnz_/xsltpatch/xslt-polyfill.js` (`0x8004F117`). Le polyfill devient
  **`bnz_/xsltpatch/xsltpolyfill.js`**, avec un **nouveau GUID**
  (`6cc54fc8-f34e-41ab-816d-077d0108f770`) : Dynamics ne renomme pas une web resource
  existante. L'ancienne (`bd9d1a25-e5eb-434a-8d3d-d12ade8086b2`) est listée dans
  `retiredWebResources` de `solution.config.json`. Sur une org 9.x déjà en 1.0.0.7, une
  mise à niveau (*Upgrade*) de la solution gérée la supprime ; une simple mise à jour
  (*Update*) la laisse en place, inutilisée. Le loader reçoit le nom au build (`{{POLYFILL_WEBRESOURCE}}`), aucune
  autre référence à mettre à jour.
- **Build : contrôle des web resources.** Nom conforme à la règle 8.2 et au préfixe
  `bnz_/`, GUID bien formé, ni GUID ni nom en double, aucun GUID ou nom retiré réutilisé.

## [1.0.0.7] - 2026-11-19

Correctif d'import CRM 8.2 : le package 8.2 de 1.0.0.6 était refusé à la validation XSD.
Loader, polyfill et ribbon inchangés depuis 1.0.0.5.

### Corrigé

- **Import refusé sur CRM 8.2 : `OrganizationVersion` non déclaré (#7).** La racine
  `<ImportExportXml>` de `customizations.xml` portait `OrganizationVersion` et
  `OrganizationSchemaType` pour toutes les cibles. Le schéma XSD de CRM 8.2 ne les déclare
  pas : la validation du package échouait (`0x8004801A`) avant tout import. Ces attributs
  n'apparaissent plus que pour les cibles 9.x (clé de cible
  `customizationsOrganizationAttributes` dans `solution.config.json`) ; la racine 8.2 est
  maintenant celle d'un export 8.2 réel. Le build vérifie les attributs de cette racine et
  l'absence des nœuds retirés pour chaque cible.
- **Workflow Release : une version refusée n'arrête plus rien (#2).** L'étape « Set
  version » écrivait `echo "result=$(node scripts/release.mjs set-version …)"` : son statut
  était celui d'`echo`, toujours 0. Une version inférieure à l'actuelle, sans tag existant,
  allait donc jusqu'au tag et à la release, avec les solutions de la version courante. Le
  résultat est maintenant affecté d'abord (`result=$(…)`, dont le statut arrête le job sous
  `bash -e`), puis contrôlé (`changed` ou `unchanged`) avant d'être écrit dans
  `$GITHUB_OUTPUT`.

## [1.0.0.6] - 2026-11-19

Outillage seulement : le contenu de la solution (loader, polyfill, ribbon) est celui de
1.0.0.5. Première version publiée par le workflow Release, en solutions gérées.

### Ajouté

- **CI GitHub Actions** (`ci.yml`) : `npm ci` + `npm test` (Chrome headless) sur chaque push
  vers `main` et chaque pull request, solutions construites en artefact.
- **Release GitHub Actions** (`release.yml`, déclenchement manuel avec la version `a.b.c.d`) :
  version écrite dans `solution.config.json`, tests, solutions gérées 8.2, 9.1 et 9.2, commit
  de version, tag `a.b.c.d`, release avec les zips en assets et les notes du CHANGELOG.
- `scripts/release.mjs` : `set-version` (refuse une version inférieure) et `notes`.
- Build : option `--managed` (`<Managed>1</Managed>`, zips suffixés `_managed`) et cible
  **9.1** (`SolutionPackageVersion="9.1"`), ajoutée aux cibles par défaut.
- `build.ps1` : `-Managed` et cible 9.1.
- `autotest.mjs` : `--no-sandbox` sur les runners Linux en CI (sandbox Chrome bloqué par
  AppArmor sur Ubuntu 24.04), et Chrome lancé avec `--disable-blink-features=XSLT`. Le
  Chrome du runner (157) a encore XSLT natif dans les popups et `about:blank`, où
  `test/harness/sim.js` ne passe pas : les cas popup échouaient. Le banc affiche maintenant
  l'environnement (XSLT natif présent ou non hors des pages du banc).
- Workflows en Node 24 (`checkout@v5`, `setup-node@v5`, `upload-artifact@v7`).

## [1.0.0.5] - 2026-11-19

Test de 1.0.0.4 sur l'org online 9.2 : le ribbon de la Recherche avancée s'affiche
correctement. Problème suivant : à l'ouverture d'une vue existante (ex. « Mes processus » sur
Processus), toutes les conditions sur un groupe d'options sont vidées (`Enter Value`) et
marquées « This condition had one or more list values that no longer exist in the system ».
Une condition ajoutée à la main fonctionne.

### Corrigé

- **Valeurs des conditions de groupe d'options perdues dans une vue existante (DYN-009).**
  Chaîne observée dans l'org :
  1. `cachemanager.js` (`_getFieldList`) construit la liste des champs d'une entité par une
     transformation XSLT (`xsl:output method="xml"`) qui recopie les attributs de chaque champ,
     dont `optionsXML` (la liste des valeurs du groupe d'options).
  2. `Mscrm.XslProcessor.transform` (`global.ashx`) appelle
     `transformToFragment(input, input)` : le document de sortie est le **XMLDocument**
     d'entrée, pas la page. Le fragment est ensuite sérialisé et gardé dans le cache.
  3. À l'ouverture d'une vue, `advancedfindcontrol.js` relit le champ dans ce cache et appelle
     `attributes.getNamedItem("optionsXML")`, sensible à la casse en XML. Chaque valeur absente
     de `optionsXML` est retirée de la condition, qui passe en avertissement.

  Le polyfill décidait du traitement du fragment d'après la **page** (HTML) et non d'après le
  document passé en paramètre. Il ajoutait le namespace XHTML et mettait les attributs en
  minuscules (`optionsxml`). `getNamedItem("optionsXML")` renvoyait donc `null` et toutes les
  valeurs étaient jugées supprimées. Une condition ajoutée à la main ne passe pas par cette
  vérification, d'où la différence.

  `transformToFragment` se fonde maintenant sur le `contentType` du document de sortie. Dans un
  document XML, il ne force plus le namespace XHTML et garde la casse des attributs, comme le
  XSLT natif. Le comportement dans un document HTML ne change pas.

### Ajouté

- Banc de test : transformation de la liste des champs de la Recherche avancée vers un
  XMLDocument (casse de `optionsXML`, pas de namespace XHTML), et contrôle que la sortie vers
  la page HTML reste en HTML. 27 cas au total.

## [1.0.0.4] - 2026-11-19

Test de 1.0.0.3 sur l'org online 9.2 (Recherche avancée ouverte depuis
`main.aspx?settingsonly=true`, utilisateur en français). La popup est bien patchée : polyfill
présent dans `main.aspx` et `AdvFind.aspx`, 4 appels XSLT, **aucune erreur**, aucun include.
Le ribbon cassé n'avait donc rien à voir avec XSLT, et DYN-006 n'en était pas la cause.

### Corrigé

- **Ribbon de la Recherche avancée en texte brut, `undefined` en haut de la page (DYN-008).**
  La page lie `/_static/css/1036/cui.css`, la feuille du ribbon legacy (CUI). Le serveur
  répond 404 pour ce fichier ; seule la copie `/_static/css/1033/cui.css` existe. Sans cette
  CSS, les classes `ms-cui-*` ne s'appliquent pas : boutons et libellés sortent en texte, et
  le `span#ribboninstruction.ms-cui-hidden`, qui contient le texte `undefined`, reste
  visible. Le loader repère désormais les `<link rel="stylesheet">` même origine dont le
  chargement a échoué et dont l'URL contient un segment de langue après `/_static/css/`. Il
  ajoute juste après une copie du lien vers la langue de repli (1033), en gardant la query
  string. Vérifié sur l'org : avec la feuille 1033, le ribbon reprend sa hauteur normale
  (135 px) et `undefined` passe hors écran.
  - Détection par le balayage, sans écouteur d'événement : `cssRules` illisible
    (`SecurityError` sur une feuille même origine en échec), ou statut HTTP ≥ 400 dans
    `performance` quand le navigateur le fournit.
  - Un lien n'est traité qu'une fois (`__bnzCssFallback`, `data-bnz-css-fallback`), même si
    plusieurs copies du loader balayent la même fenêtre.
  - Journal : action `css-fallback`. Le diagnostic indique le nombre de CSS de repli par fenêtre.

### Ajouté

- Banc de test : `main.aspx` lie `/_static/css/1036/cui.css` (404) et contient le span
  `ribboninstruction`. 2 cas de plus (25 au total).

### Configuration

Nouvelles clés : `cssFallbackLcid` (`'1033'`, chaîne vide pour désactiver) et
`cssFallbackPatterns` (`['/_static/css/']`).

### Limites restantes

- Comme le reste du patch, le repli CSS n'agit que si le loader est actif, c'est-à-dire quand
  le navigateur n'a pas de XSLT natif. Le 404 sur `cui.css` vient du serveur Dynamics : un
  navigateur avec XSLT natif le subit aussi.

## [1.0.0.3] - 2026-11-19

Suite au test de 1.0.0.1 sur une org online 9.2 (Recherche avancée ouverte depuis
`main.aspx?settingsonly=true`) :
- **Ce qui marche :** la popup est maintenant patchée et le constructeur de requête s'affiche.
- **Ce qui reste cassé :** le ribbon de la Recherche avancée sort en texte brut, sans mise en
  page, et `undefined` est écrit en haut de la page.

### Corrigé

- **DYN-006 : `xsl:include` et `xsl:import` dans les appels synchrones.** Le chargeur WASM du
  polyfill suspend toujours l'exécution (Asyncify) pour lire un fichier inclus. Tout appel
  synchrone à `XSLTProcessor` sur une feuille qui en inclut une autre échouait donc. Le XSLT
  natif de Chrome, lui, chargeait ces fichiers de façon synchrone, et Dynamics en dépend.
  Désormais, `importStylesheet` charge les fichiers inclus et importés par XHR synchrone
  (même origine) et les recopie dans la feuille :
  - `include` : contenu inséré à la place de l'élément ;
  - `import` : contenu placé avant les éléments de la feuille, pour garder une précédence plus
    basse. Les templates nommés et variables globales que la feuille redéfinit sont ignorés.

  Les déclarations de namespace des fichiers inclus restent en portée. C'est la cause
  **probable** du ribbon cassé, à confirmer sur l'org.

### Ajouté

- **DYN-007 : trace des appels XSLT** dans chaque fenêtre polyfillée : nombre d'appels, 30
  dernières erreurs avec la feuille XSL en cause, includes résolus ou en échec. Chaque échec
  est écrit dans la console : `[bnz.XsltPatch] XSLT … failed: … | stylesheet: … | url: …`.
- `bnz.XsltPatch.report()` : rapport JSON complet (fenêtres, erreurs XSLT, includes en
  échec, journal). À utiliser dans la console F12 de la fenêtre concernée :
  `copy(bnz.XsltPatch.report())`.
- Le dialogue de diagnostic affiche le nombre d'appels et d'erreurs XSLT par fenêtre, ainsi
  que la dernière erreur.
- Banc de test : feuille avec `xsl:import` + `xsl:include` et namespace EXSLT déclaré
  seulement dans le fichier inclus. Vérifie aussi qu'un `document()` en échec n'empêche pas
  les transformations suivantes. 23 cas au total.

### Limites restantes

- `document()` dans un appel synchrone échoue toujours, avec l'erreur
  `Unknown mime type undefined`. Le module reste utilisable après coup. Le corriger demande
  de modifier `transform.c` et de recompiler le WASM (backlog DYN-101).
- `xsl:apply-imports` n'a plus rien à appliquer une fois les imports recopiés dans la feuille.

## [1.0.0.1] - 2026-11-19

Corrige le cas de la **Recherche avancée** : en 9.2, la popup ouverte depuis les paramètres
(« settings only ») ne charge même pas son ribbon. La règle Enable ne s'y exécute donc pas, et
le patch non plus.

### Ajouté

- **Nouveaux points d'amorçage dans le ribbon applicatif** :
  - `Mscrm.AdvancedFind.Groups.Debug` : fenêtre Recherche avancée, quand son ribbon se charge ;
  - `Mscrm.BasicHomeTab.Tools` : pages sans contexte d'entité (pages de paramètres legacy, pages personnalisées) ;
  - `Mscrm.GlobalTab.New` : barre de commande globale UCI, présente sur toutes les pages UCI.
- **Popups traitées dès leur `about:blank`.** La `Window` initiale `about:blank` d'une popup ou
  d'une iframe est réutilisée par sa première navigation même origine. Le stub, posé
  immédiatement après `window.open`, est donc déjà là quand le premier script de la page
  s'exécute. Comportement vérifié dans Chrome 158.
- **Propagation du loader.** Une copie du loader est évaluée dans chaque popup suivie. La popup
  suit ensuite elle-même ses iframes et ses propres popups, sans dépendre de son ribbon. Cela
  couvre la chaîne UCI → Paramètres avancés (settings only) → Recherche avancée.
- **Hook d'insertion d'iframes** (`appendChild` / `insertBefore`, une fois par royaume) : une
  iframe insérée par script reçoit le stub de façon synchrone, avant sa navigation.
- **Détection de la Recherche avancée** (`pagetype=advancedfind`, `/advancedfind/`) : stub et
  installation immédiate du polyfill.
- **Récupération des pages manquées.** Une Recherche avancée trouvée déjà chargée sans XSLT
  (son ribbon a amorcé le loader trop tard, par exemple) est confiée à son opener, avec
  injection du loader dans l'opener au besoin. L'opener la **rouvre une fois** : même URL, même
  nom, même position. Une iframe manquée est rechargée une fois ; la garde est stockée dans
  `sessionStorage`.
- **Préchargement du polyfill** en arrière-plan au démarrage : le stub n'a plus qu'à l'évaluer.
- Amorçage délégué au royaume de la fenêtre racine : les hooks ne survivent jamais à
  l'iframe qui les a posés.
- Banc de test : `main.aspx` (Recherche avancée et settings only) et
  `AdvancedFind/AdvFind.aspx`, qui appelle XSLT pendant le parsing. 8 cas de plus
  (`npm test`, 16 au total).

### Modifié

- La surveillance par popup (un timer par popup) est remplacée par un **balayage unique** de
  l'arbre des fenêtres. Il est rapide (25 ms) pendant 15 s après une ouverture ou un
  chargement, puis lent (400 ms).
- Une page qui demande le polyfill d'office (SSRS, Recherche avancée, XSL présent) reçoit
  aussi le stub, pour répondre tout de suite aux appels synchrones.
- Le `MutationObserver` observe le `document` lui-même : il fonctionne même pendant le
  chargement, avant la création de `documentElement`.
- Le loader ne fait plus rien (pas de hook, pas de balayage) quand le `XSLTProcessor` natif
  fonctionne.
- Une seconde évaluation de la même version du loader dans un même royaume est ignorée.

### Configuration

Ces clés ont été renommées ; une surcharge `localStorage` qui utilise les anciennes est
ignorée :

| Avant (1.0.0.0) | Après (1.0.0.1) |
|-----------------|-----------------|
| `popupFastPollMs` | `sweepFastMs` |
| `popupSlowPollMs` | `sweepSlowMs` |
| `popupFastPhaseMs` | `burstMs` |

Nouvelles clés : `propagateToPopups`, `adoptOpener`, `prefetch`, `advancedFindUrlPatterns`,
`reloadIfMissedPatterns`.

### Limites restantes

- Une Recherche avancée ouverte depuis une fenêtre où le loader n'a jamais tourné, et dont le
  ribbon ne charge pas, reste non corrigée. C'est le cas d'un onglet settings only ouvert par
  URL directe, sur une page sans barre de commande. Le patch s'applique dès qu'une grille,
  une page de paramètres avec barre de commande ou la barre UCI a été affichée dans cet onglet.
- Les emplacements `Mscrm.AdvancedFind.Groups.Debug` et `Mscrm.BasicHomeTab.Tools` sont
  utilisés par des solutions publiques. Ils restent à confirmer sur une org 8.2 et une org 9.2
  réelles. `Mscrm.GlobalTab` n'existe qu'en UCI.

## [1.0.0.0] - 2026-11-19

Première version.

### Ajouté

- Solution `XSLT_Patch` (éditeur `Benizz0`, préfixe `bnz`), cibles 8.2 et 9.2.
- Bouton « XSLT Patch » du ribbon applicatif sur les grilles, formulaires et sous-grilles de
  toutes les entités. Sa règle Enable (`bnz.XsltPatch.Ribbon.enable`) amorce le patch ; le
  bouton est masqué hors diagnostic.
- Loader `bnz_/xsltpatch/loader.js`, en ES5 :
  - détection XSLT : `XSLTProcessor` absent ou cassé, `<?xml-stylesheet?>`, éléments XSL,
    URL de rapport SSRS ;
  - stub `XSLTProcessor` paresseux : le polyfill n'est chargé qu'au premier usage ;
  - installation immédiate du polyfill dans les pages SSRS et les pages contenant du XSLT ;
  - suivi des `window.open` (popups de rapport) et des iframes ;
  - diagnostic (`bnz.XsltPatch.diagnostics()`, bouton en mode debug), coupe-circuit
    `mode: 'off'`.
- Polyfill `bnz_/xsltpatch/xslt-polyfill.js` : fork local de `mfreed7/xslt_polyfill` 1.0.37
  (libxslt/libxml2 en WASM) avec les correctifs DYN-000 à DYN-004.
- Build Node (`npm run build`) qui produit les zips de solution, sans SolutionPackager.
  Banc de test headless (`npm test`).
