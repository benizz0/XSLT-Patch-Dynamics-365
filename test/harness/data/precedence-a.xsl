<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="precedence-a1.xsl" />
  <!-- Beats precedence-a1's priority="100". -->
  <xsl:template match="a">A;</xsl:template>
  <!-- Loses against precedence-b despite priority="5". -->
  <xsl:template match="b" priority="5">Ab;</xsl:template>
  <xsl:template name="n">n-A</xsl:template>
</xsl:stylesheet>
