<?xml version="1.0" encoding="utf-8"?>
<!-- The math prefix is declared here only: it must stay in scope once inlined. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:math="http://exslt.org/math" exclude-result-prefixes="math">
  <xsl:template name="cell">
    <td><xsl:value-of select="@name" /></td><td><xsl:value-of select="@revenue" /></td>
  </xsl:template>
  <xsl:template name="max">max=<xsl:value-of select="math:max(/report/row/@revenue)" /></xsl:template>
</xsl:stylesheet>
