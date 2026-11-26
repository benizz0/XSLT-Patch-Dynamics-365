<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="diamond-d.xsl" />
  <xsl:variable name="v" select="'B'" />
  <xsl:template match="w" priority="1">B;</xsl:template>
  <xsl:template match="e" priority="1">Be;</xsl:template>
  <xsl:template name="n">nB;</xsl:template>
</xsl:stylesheet>
