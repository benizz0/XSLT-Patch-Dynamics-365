<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/sim.js"></script>
  <script src="/mscrm-xsl.js"></script>
  <title>Advanced Find</title>
</head>
<body>
  <!--
    Shape read on a 9.2 online org (/AdvancedFind/AdvFind.aspx inside
    main.aspx?pagetype=advancedfind): the entity list comes from the server;
    XSLT runs on demand (cachemanager.js _getFieldList / _getEntityList,
    through Mscrm.XslTemplate), and the page holds two static iframes on
    /_static/blank.htm. The ribbon library (loader.js) is evaluated in this
    realm, not in main.aspx.
  -->
  <p>Recherche avancée (forme relevée sur l'org) : XSLT à la demande.</p>
  <select id="slctPrimaryEntity">
    <option value="account">Compte</option>
    <option value="contact">Contact</option>
  </select>
  <iframe id="resultFrame" name="resultFrame" src="/_static/blank.htm" width="300" height="40"></iframe>
  <iframe id="downloadXmlFrame" name="downloadXmlFrame" src="/_static/blank.htm" width="300" height="40"></iframe>
  <script>
    // cachemanager.js _getFieldList: attribute names are case sensitive (DYN-009).
    var FIELD_LIST_XSL =
      "<xsl:stylesheet xmlns:xsl='http://www.w3.org/1999/XSL/Transform' version='2.0'>" +
      "<xsl:output method='xml' omit-xml-declaration='yes'/>" +
      "<xsl:template match='/fields'><xsl:apply-templates select='result'/></xsl:template>" +
      "<xsl:template match='result'><option><xsl:apply-templates select='@*'/><xsl:value-of select='.'/></option></xsl:template>" +
      "<xsl:template match='@*'><xsl:attribute name='{name()}'><xsl:value-of select='.'/></xsl:attribute></xsl:template>" +
      '</xsl:stylesheet>';
    window.harnessGetFieldList = function () {
      var entity = document.getElementById('slctPrimaryEntity').value;
      return harnessMscrmTransform(FIELD_LIST_XSL,
        "<fields><result value='name' datatype='nvarchar' entityName='" + entity + "'>Nom</result></fields>");
    };
  </script>
</body>
</html>
