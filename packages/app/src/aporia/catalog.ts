// APORIA: curated MCP catalog. Edit freely; env lists hold variable NAMES only, never values.
export default {
  "categories": ["Recommended", "Productivity", "Code", "Communication", "Browser", "Data"],
  "apps": [
    { "id": "github", "name": "GitHub", "category": "Code", "description": "Repos, issues and pull requests", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-github"], "env": ["GITHUB_PERSONAL_ACCESS_TOKEN"], "recommended": true },
    { "id": "filesystem", "name": "Filesystem", "category": "Recommended", "description": "Read and write files in a folder you choose", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."], "env": [], "recommended": true },
    { "id": "playwright", "name": "Playwright browser", "category": "Browser", "description": "Drive a real browser: click, type, screenshot", "type": "local", "command": ["npx", "-y", "@playwright/mcp@latest"], "env": [], "recommended": true },
    { "id": "context7", "name": "Context7", "category": "Code", "description": "Up-to-date library docs", "type": "remote", "url": "https://mcp.context7.com/mcp", "env": [] },
    { "id": "notion", "name": "Notion", "category": "Productivity", "description": "Pages and databases", "type": "remote", "url": "https://mcp.notion.com/mcp", "env": [] },
    { "id": "linear", "name": "Linear", "category": "Productivity", "description": "Issues, projects and cycles", "type": "remote", "url": "https://mcp.linear.app/mcp", "env": [] },
    { "id": "slack", "name": "Slack", "category": "Communication", "description": "Read channels and draft messages", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-slack"], "env": ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"] },
    { "id": "memory", "name": "Memory", "category": "Data", "description": "A persistent knowledge graph for the agent", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-memory"], "env": [] },
    { "id": "fetch", "name": "Fetch", "category": "Data", "description": "Fetch web pages as markdown", "type": "local", "command": ["uvx", "mcp-server-fetch"], "env": [] },
    { "id": "sentry", "name": "Sentry", "category": "Code", "description": "Errors and performance issues", "type": "remote", "url": "https://mcp.sentry.dev/mcp", "env": [] }
  ]
}
