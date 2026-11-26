<?xml version="1.0" encoding="utf-8"?>
<!-- Diamond import (DYN-006, issue #25): this stylesheet imports diamond-b
     then diamond-c, and both import diamond-d (which includes diamond-e). The
     shared module appears twice in the import tree (XSLT 1.0, 2.6.2).
     Precedence, lowest first: d+e (under b), b, d+e (under c), c, this
     stylesheet. The copy under c beats b. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="diamond-b.xsl" />
  <xsl:import href="diamond-c.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r">
    <xsl:apply-templates select="*" />
    <xsl:call-template name="n" />
    <xsl:value-of select="$v" />
  </xsl:template>
</xsl:stylesheet>
