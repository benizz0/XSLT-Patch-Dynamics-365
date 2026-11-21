<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:template match="x" priority="5">A;</xsl:template>
  <xsl:template match="y" priority="10">Ay;</xsl:template>
  <xsl:template match="z" priority="3">Az;</xsl:template>
  <xsl:template match="w">Aw;</xsl:template>
  <xsl:template match="x" mode="m" priority="10">Am;</xsl:template>
</xsl:stylesheet>
