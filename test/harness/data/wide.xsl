<?xml version="1.0" encoding="utf-8"?>
<!-- Shared import graph (DYN-006, issue #25): 16 imports of wide-b, each
     importing wide-leaf 16 times, i.e. 272 copies. Inlining stops at 256
     copies, the 16 remaining references are listed in
     __bnzXsltInlineReport.truncated, and wide-leaf is fetched once. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:import href="wide-b.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r"><xsl:apply-templates select="*" /></xsl:template>
</xsl:stylesheet>
