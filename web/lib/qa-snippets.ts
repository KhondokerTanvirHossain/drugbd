/*
 * The code shown on /review/qa (§5.18): the MCP and API addresses and the three setup snippets, built from SITE_HOST. Code,
 * not copy (§1.7); the page's component test pins each one. They carry $INTELLIDRUGS_QA_KEY or YOUR_KEY, never a key.
 */
/** The §5.18 snippets, exactly, for `host` (SITE_HOST: host[:port]). */
export function qaSnippets(host: string) {
  const mcp = `https://${host}/api/qa/mcp`;
  const api = `https://${host}/api/qa/v1`;
  return {
    mcp, api,
    claudeCode: `claude mcp add --transport http intellidrugs-qa ${mcp} --header "Authorization: Bearer $INTELLIDRUGS_QA_KEY"`,
    cursor: [
      "{",
      '  "mcpServers": {',
      '    "intellidrugs-qa": {',
      `      "url": "${mcp}",`,
      '      "headers": { "Authorization": "Bearer YOUR_KEY" }',
      "    }",
      "  }",
      "}",
    ].join("\n"),
    curl: `curl -H "Authorization: Bearer $INTELLIDRUGS_QA_KEY" "${api}/records?filter=strength_missing"`,
  };
}
