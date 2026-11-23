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
        shell.innerHTML = '<span id="ribboninstruction" class="ms-cui-hidden">undefined</span>' +
          '<div id="crmRibbonManager" class="ms-cui-ribbon"><ul class="ms-cui-tabBody">' +
          '<li class="ms-cui-group"><a class="ms-cui-ctl-large">Résultats</a></li>' +
          '<li class="ms-cui-group"><a class="ms-cui-ctl-large">Enregistrer</a></li>' +
          '<li class="ms-cui-group"><a class="ms-cui-ctl-large">Effacer</a></li>' +
          '</ul></div>';
        if (q.indexOf('shape=real') !== -1) {
          // Shape read on a 9.2 online org: contentIFrame0 sits in the markup
          // (div > div) without src and is navigated by script. innerHTML
          // keeps it away from the appendChild hook (MutationObserver path).
          var host = document.createElement('div');
          host.innerHTML = '<div><iframe id="contentIFrame0" name="contentIFrame0" frameborder="0" title=""' +
            ' style="width: 600px; height: 150px"></iframe></div>';
          shell.appendChild(host);
          document.getElementById('contentIFrame0').contentWindow.location.replace('/AdvancedFind/QueryBuilder.aspx');
          return;
        }
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
