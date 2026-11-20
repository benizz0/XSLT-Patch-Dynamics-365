<?xml version="1.0" encoding="utf-8"?>
<!-- Import precedence regression (issue #5, DYN-006): successive and nested
     imports, an include inside an import, named templates and variables.
     Precedence, lowest first: precedence-a1, precedence-a, precedence-b
     (+ precedence-b-inc), this stylesheet. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="precedence-a.xsl" />
  <xsl:import href="precedence-b.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/root">
    <xsl:apply-templates select="*" />|<xsl:call-template name="n" />|<xsl:value-of select="$v" />
  </xsl:template>
  <!-- Default priority 0 beats precedence-b's priority="9". -->
  <xsl:template match="c">Mc;</xsl:template>
  <!-- Same precedence: P (0.5) must beat the "d" alternative (0) of U. -->
  <xsl:template match="*[self::d]">P;</xsl:template>
  <xsl:template match="d|none//*">U;</xsl:template>
</xsl:stylesheet>
