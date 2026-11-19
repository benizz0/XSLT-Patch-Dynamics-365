<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" />
  <xsl:param name="title" select="'Rapport'" />
  <xsl:template match="/report">
    <table class="bnz-test">
      <caption><xsl:value-of select="$title" /> - <xsl:value-of select="@name" /></caption>
      <xsl:for-each select="row">
        <xsl:sort select="@revenue" data-type="number" order="descending" />
        <tr><td><xsl:value-of select="@name" /></td><td><xsl:value-of select="@revenue" /></td></tr>
      </xsl:for-each>
    </table>
  </xsl:template>
</xsl:stylesheet>
