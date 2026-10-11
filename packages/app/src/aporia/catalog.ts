// APORIA: curated MCP catalog. Remote URLs verified 2026-10-11 (401 + OAuth discovery = sign-in in browser).
// env lists hold variable NAMES; values typed in the app go to Windows user env vars, never opencode.json.
export default {
  "categories": ["Recommended", "Productivity", "Code", "Communication", "Browser", "Data"],
  "apps": [
    { "id": "notion", "name": "Notion", "category": "Productivity", "description": "Pages and databases (sign in)", "type": "remote", "url": "https://mcp.notion.com/mcp", "auth": "oauth", "env": [], "recommended": true },
    { "id": "linear", "name": "Linear", "category": "Productivity", "description": "Issues, projects and cycles (sign in)", "type": "remote", "url": "https://mcp.linear.app/mcp", "auth": "oauth", "env": [] },
    { "id": "atlassian", "name": "Atlassian", "category": "Productivity", "description": "Jira and Confluence (sign in)", "type": "remote", "url": "https://mcp.atlassian.com/v1/mcp", "auth": "oauth", "env": [] },
    { "id": "asana", "name": "Asana", "category": "Productivity", "description": "Tasks and projects (sign in)", "type": "remote", "url": "https://mcp.asana.com/sse", "auth": "oauth", "env": [] },
    { "id": "github", "name": "GitHub", "category": "Code", "description": "Repos, issues and PRs (personal access token)", "type": "remote", "url": "https://api.githubcopilot.com/mcp/", "auth": "key", "env": ["GITHUB_PERSONAL_ACCESS_TOKEN"], "recommended": true },
    { "id": "vercel", "name": "Vercel", "category": "Code", "description": "Projects, deployments and logs (sign in)", "type": "remote", "url": "https://mcp.vercel.com", "auth": "oauth", "env": [] },
    { "id": "sentry", "name": "Sentry", "category": "Code", "description": "Errors and performance issues (sign in)", "type": "remote", "url": "https://mcp.sentry.dev/mcp", "auth": "oauth", "env": [] },
    { "id": "stripe", "name": "Stripe", "category": "Data", "description": "Payments, customers, invoices (sign in)", "type": "remote", "url": "https://mcp.stripe.com", "auth": "oauth", "env": [] },
    { "id": "context7", "name": "Context7", "category": "Code", "description": "Up-to-date library docs (no sign-in)", "type": "remote", "url": "https://mcp.context7.com/mcp", "env": [] },
    { "id": "playwright", "name": "Playwright browser", "category": "Browser", "description": "Drive a real browser: click, type, screenshot", "type": "local", "command": ["npx", "-y", "@playwright/mcp@latest"], "env": [], "recommended": true },
    { "id": "filesystem", "name": "Filesystem", "category": "Data", "description": "Read and write files in a folder you choose", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."], "env": [] },
    { "id": "slack", "name": "Slack", "category": "Communication", "description": "Read channels and draft messages (bot token)", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-slack"], "env": ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"] },
    { "id": "memory", "name": "Memory", "category": "Data", "description": "A persistent knowledge graph for the agent", "type": "local", "command": ["npx", "-y", "@modelcontextprotocol/server-memory"], "env": [] },
    { "id": "fetch", "name": "Fetch", "category": "Data", "description": "Fetch web pages as markdown", "type": "local", "command": ["uvx", "mcp-server-fetch"], "env": [] }
  ]
}
