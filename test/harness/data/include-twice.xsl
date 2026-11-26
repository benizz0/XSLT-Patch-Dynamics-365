<?xml version="1.0" encoding="utf-8"?>
<!-- The same module included twice at one precedence (DYN-006, issue #25).
     It is inlined once, as before: inlining it twice would define the
     named template and the global variable twice at the same precedence. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:include href="include-twice-x.xsl" />
  <xsl:include href="include-twice-x.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r"><xsl:apply-templates select="*" /><xsl:call-template name="n" /><xsl:value-of select="$v" /></xsl:template>
</xsl:stylesheet>
