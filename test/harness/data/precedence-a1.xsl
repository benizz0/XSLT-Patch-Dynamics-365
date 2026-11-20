<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="a" priority="100">A1;</xsl:template>
  <xsl:template match="e">A1e;</xsl:template>
  <!-- Name overridden by precedence-a, template rule kept. -->
  <xsl:template name="n" match="f">n-A1;</xsl:template>
  <xsl:variable name="v" select="'A1'" />
</xsl:stylesheet>
