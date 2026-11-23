<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="/sim.js"></script>
  <script src="/mscrm-xsl.js"></script>
  <title>Report Viewer</title>
</head>
<body>
  <!--
    Shape read on a 9.2 online org (viewer.aspx?action=run, Account Summary):
    the report filter summary goes through Mscrm.XslTemplate (reports.js), then
    the form posts into the static resultFrame (/CRMReports/rsviewer/
    reportviewer.aspx, which calls no XSLT itself). Without XSLT the form is
    never posted: the report stays blank, with no console error.
    The real path is /CRMReports/..., lower case here (case-sensitive CI file system).
  -->
  <form id="reportForm" action="/crmreports/rsviewer/reportviewer.aspx" method="post" target="resultFrame">
    <input type="hidden" id="CRM_Filter" name="CRM_Filter">
    <input type="hidden" id="CRM_FilterText" name="CRM_FilterText">
  </form>
  <iframe id="resultFrame" name="resultFrame" src="/_static/blank.htm" width="600" height="80"></iframe>
  <script>
    var FILTER_SUMMARY_XSL =
      "<xsl:stylesheet xmlns:xsl='http://www.w3.org/1999/XSL/Transform' version='1.0'>" +
      "<xsl:output method='xml' omit-xml-declaration='yes'/>" +
      "<xsl:template match='/filter'><summary><xsl:for-each select='condition'>" +
      "<xsl:value-of select='@attribute'/><xsl:text> </xsl:text><xsl:value-of select='@operator'/>" +
      "<xsl:text> </xsl:text><xsl:value-of select='@value'/>" +
      "</xsl:for-each></summary></xsl:template>" +
      '</xsl:stylesheet>';
    window.__viewerSummary = null;
    window.addEventListener('load', function () {
      var summary = harnessMscrmTransform(FILTER_SUMMARY_XSL,
        "<filter><condition attribute='accountid' operator='eq' value='1'/></filter>");
      window.__viewerSummary = summary;
      if (/^ERROR/.test(summary)) {
        return; // as on the org: no post, blank report
      }
      document.getElementById('CRM_FilterText').value = summary;
      document.getElementById('reportForm').submit();
    });
  </script>
</body>
</html>
