<?xml version="1.0" encoding="utf-8"?>
<!-- Module imported at two levels (DYN-006, issue #25): this stylesheet
     imports twolevel-b then twolevel-d, and twolevel-b imports twolevel-d too.
     Precedence, lowest first: d (under b), b, d, this stylesheet. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="twolevel-b.xsl" />
  <xsl:import href="twolevel-d.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r"><xsl:apply-templates select="*" /></xsl:template>
</xsl:stylesheet>
