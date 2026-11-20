<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:include href="precedence-b-inc.xsl" />
  <xsl:template match="b">Bb;</xsl:template>
  <xsl:template match="c" priority="9">Bc;</xsl:template>
  <xsl:variable name="v" select="'B'" />
</xsl:stylesheet>
