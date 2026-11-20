<?xml version="1.0" encoding="utf-8"?>
<!-- Named templates are compared by expanded name (PR #21 review): p:render
     from urn:a (import) and urn:b (include) are distinct; pa:over overrides
     the imported p:over (same URI, other prefix). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:pa="urn:a" xmlns:pb="urn:b">
  <xsl:import href="precedence-ns-a.xsl" />
  <xsl:include href="precedence-ns-b.xsl" />
  <xsl:output method="text" />
  <xsl:template name="pa:over">over-main;</xsl:template>
  <xsl:template match="/">
    <xsl:call-template name="pa:render" />
    <xsl:call-template name="pb:render" />
    <xsl:call-template name="pa:over" />
  </xsl:template>
</xsl:stylesheet>
