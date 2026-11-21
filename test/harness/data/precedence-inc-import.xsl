<?xml version="1.0" encoding="utf-8"?>
<!-- Import precedence regression (DYN-006): an xsl:import inside an included
     module moves up after the including module's own imports (XSLT 1.0,
     2.6.2), negative priorities and modes. Precedence, lowest first:
     precedence-inc-import-a, precedence-inc-import-j, this stylesheet (with
     precedence-inc-import-i). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="precedence-inc-import-a.xsl" />
  <xsl:include href="precedence-inc-import-i.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r">
    <xsl:apply-templates select="*" />
    <xsl:apply-templates select="x" mode="m" />
  </xsl:template>
  <!-- Beats -a's priority="10" and -j's priority="20". -->
  <xsl:template match="y">My;</xsl:template>
  <!-- Negative local priority still beats -a's priority="3". -->
  <xsl:template match="z" priority="-2">Mz;</xsl:template>
  <!-- Modes are ranked the same way. -->
  <xsl:template match="x" mode="m">Mm;</xsl:template>
</xsl:stylesheet>
