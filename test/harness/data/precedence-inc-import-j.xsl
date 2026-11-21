<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <!-- Beats -a's priority="5": higher import precedence. -->
  <xsl:template match="x">J;</xsl:template>
  <xsl:template match="y" priority="20">Jy;</xsl:template>
  <!-- Loses against -i (precedence of the main stylesheet). -->
  <xsl:template match="v" priority="50">Jv;</xsl:template>
  <!-- Beats -a's default priority despite priority="-1". -->
  <xsl:template match="w" priority="-1">Jw;</xsl:template>
</xsl:stylesheet>
