<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <!-- Lower import precedence: both must lose against with-include.xsl. -->
  <xsl:template name="caption">BASE</xsl:template>
  <xsl:template match="/report">BASE-REPORT</xsl:template>
</xsl:stylesheet>
