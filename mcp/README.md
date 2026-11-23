# tsdraw ↔ Claude desktop app

This lets you chat with Claude in the **Claude desktop app** (signed in with your own Claude account,
no API key) and have it draw molecules in tsdraw, or read what you have drawn.

```
Claude desktop app ──(MCP, stdio)──> mcp/tsdraw-mcp.mjs ──(http://127.0.0.1:7865)──> tsdraw page in your browser
```

`tsdraw-mcp.mjs` is plain Node.js with no dependencies. Claude Desktop starts it; the tsdraw page
connects to it, and the status bar shows **● Claude Desktop connected**.

## Set up (once)

1. In the Claude desktop app: **Settings → Developer → Edit Config**. This opens
   `%APPDATA%\Claude\claude_desktop_config.json`.
2. Add the tsdraw server (keep any servers already listed under `mcpServers`):

   ```json
   {
     "mcpServers": {
       "tsdraw": {
         "command": "node",
         "args": ["C:\\JOB\\misc\\Chemistry\\Draw\\tsdraw\\mcp\\tsdraw-mcp.mjs"]
       }
     }
   }
   ```

3. Quit the Claude desktop app completely (also from the system tray) and start it again.
   **tsdraw** should appear in the tools/connectors menu of a chat.

## Use

1. Start tsdraw as usual: `npm run dev` in the `tsdraw` folder, and keep the page open.
   The status bar shows **● Claude Desktop connected** once the Claude app is running.
2. In the Claude desktop app, ask for example:
   - "Draw aspirin and ibuprofen in tsdraw"
   - "What did I draw in tsdraw? Give the IUPAC name and the logP"
   - "Look at my tsdraw drawing and suggest a bioisostere for the carboxylic acid, then draw it"

Claude Desktop asks for your permission the first time it uses each tool.

## Tools

| Tool | What it does |
|---|---|
| `draw_molecule` | Draws a SMILES or MOL file (added beside the drawing, or `replace: true` to start over) |
| `get_drawing` | The drawing (or only the selection) as SMILES and/or MOL file, with its formula |
| `get_drawing_image` | A PNG picture of the drawing, cropped to the structures |
| `clear_drawing` | Clears the canvas (Ctrl+Z brings it back) |

## Notes

- Port: 7865. To change it, set `"env": { "TSDRAW_BRIDGE_PORT": "7999" }` in the config above and open
  tsdraw with `?bridge=7999` at the end of its address.
- The bridge only listens on 127.0.0.1 and only accepts pages served from this computer (localhost).
- If Claude says "tsdraw is not open", start `npm run dev` and open (or refresh) the tsdraw page.
