<?xml version="1.0" encoding="utf-8"?>
<!-- Import nested beyond the 16-level limit (DYN-006, issue #25). ".//"
     resolves to a new URL with one more empty path segment at each level,
     which the harness server maps back to this file: the chain never cycles
     and the reference left at the last level is listed in
     __bnzXsltInlineReport.truncated. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:import href=".//deep.xsl" />
  <xsl:output method="text" />
  <xsl:template match="/r">deep;</xsl:template>
</xsl:stylesheet>
