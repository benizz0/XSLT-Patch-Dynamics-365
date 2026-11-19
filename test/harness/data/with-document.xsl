<?xml version="1.0" encoding="utf-8"?>
<!-- document() is not supported by synchronous calls (backlog): must fail
     cleanly without breaking the next transforms. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" />
  <xsl:template match="/">
    <p><xsl:value-of select="count(document('sample.xml')/report/row)" /></p>
  </xsl:template>
</xsl:stylesheet>
