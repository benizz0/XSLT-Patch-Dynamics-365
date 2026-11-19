<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/sim.js"></script>
  <script src="/legacy-code.js"></script>
  <title>AdvFind.aspx</title>
</head>
<body>
  <p>Recherche avancée simulée : XSLT appelé pendant le parsing (comme le constructeur de requête legacy).</p>
  <pre id="out"></pre>
  <pre id="ribbon"></pre>
  <script>
    try {
      top.__afResult = harnessRunTransform('AF');
    } catch (e) {
      top.__afResult = 'ERROR: ' + e.message;
    }
    // Like the legacy ribbon: a stylesheet with xsl:import / xsl:include.
    try {
      top.__afRibbon = harnessRunIncludeTransform('Ribbon');
    } catch (e) {
      top.__afRibbon = 'ERROR: ' + e.message;
    }
  </script>
</body>
</html>
