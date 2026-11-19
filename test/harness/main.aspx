<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/sim.js"></script>
  <!-- Dynamics online 9.2 links the user's LCID; only 1033 exists (404 here too). -->
  <link rel="stylesheet" type="text/css" href="/_static/css/1036/cui.css?ver=1">
  <title>main.aspx</title>
</head>
<body>
  <div id="shell"></div>
  <script>
    // Stands in for Dynamics main.aspx in two modes:
    //  ?pagetype=advancedfind : Advanced Find window hosting AdvFind.aspx in an iframe
    //  ?settingsonly=true     : legacy settings-only shell (no ribbon, no Xrm)
    (function () {
      var q = location.search.toLowerCase();
      var shell = document.getElementById('shell');
      if (q.indexOf('pagetype=advancedfind') !== -1) {
        document.title = 'Advanced Find';
        // Legacy CUI ribbon: visible "undefined" when cui.css is missing.
        shell.innerHTML = '<span id="ribboninstruction" class="ms-cui-hidden">undefined</span>';
        var f = document.createElement('iframe');
        f.src = '/AdvancedFind/AdvFind.aspx';
        f.width = 600;
        f.height = 150;
        document.body.appendChild(f);
      } else if (q.indexOf('settingsonly=true') !== -1) {
        document.title = 'Settings';
        shell.textContent = 'Paramètres (settings only), sans ribbon : ';
        var b = document.createElement('button');
        b.textContent = 'Recherche avancée';
        b.onclick = function () {
          window.open('/main.aspx?pagetype=advancedfind', '_blank', 'width=700,height=300');
        };
        shell.appendChild(b);
      }
    })();
  </script>
</body>
</html>
