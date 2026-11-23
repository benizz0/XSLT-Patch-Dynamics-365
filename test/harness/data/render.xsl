<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <!-- HTML output without doctype: quirks mode, as legacy report pages. -->
  <xsl:output method="html" />
  <xsl:template match="/report">
    <html>
      <head>
        <title>Rendu</title>
        <style>body { font-size: 10px; }</style>
      </head>
      <body>
        <table id="t">
          <tr><th>Nom</th><th>CA</th></tr>
          <xsl:for-each select="row">
            <tr><td><xsl:value-of select="@name" /></td><td><xsl:value-of select="@revenue" /></td></tr>
          </xsl:for-each>
        </table>
        <ul id="l"><li id="listed">Un</li><li>Deux</li></ul>
        <li id="loose">Seul</li>
        <p id="p">Texte</p>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
