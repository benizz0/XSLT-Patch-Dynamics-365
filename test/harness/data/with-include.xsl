<?xml version="1.0" encoding="utf-8"?>
<!-- Mimics Dynamics stylesheets: one xsl:import + one xsl:include, called through
     the synchronous XSLTProcessor API (DYN-006). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="base.xsl" />
  <xsl:include href="common.xsl" />
  <xsl:output method="html" />
  <xsl:param name="title" select="'Inc'" />
  <!-- Overrides the imported named template and match template. -->
  <xsl:template name="caption"><xsl:value-of select="$title" /></xsl:template>
  <xsl:template match="/report">
    <table>
      <caption><xsl:call-template name="caption" /> - <xsl:value-of select="@name" /></caption>
      <xsl:for-each select="row">
        <xsl:sort select="@revenue" data-type="number" order="descending" />
        <tr><xsl:call-template name="cell" /></tr>
      </xsl:for-each>
      <tfoot><tr><td><xsl:call-template name="max" /></td></tr></tfoot>
    </table>
  </xsl:template>
</xsl:stylesheet>
