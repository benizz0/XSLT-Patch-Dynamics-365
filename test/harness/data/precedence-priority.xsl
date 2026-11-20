<?xml version="1.0" encoding="utf-8"?>
<!-- Issue #5 reproduction: the local rule wins over an imported priority="10". -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href="precedence-priority-base.xsl" />
  <xsl:output method="text" />
  <xsl:template match="item">MAIN</xsl:template>
</xsl:stylesheet>
