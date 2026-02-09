# Test SDK

Simple test client for connecting to the dev server and testing the REPL tool.

## Setup

1. Start the open-codemode server:

   ```bash
   cd ../open-codemode
   deno run --allow-all src/servers/ws-server.ts
   ```

2. Start the dev server (in another terminal):

   ```bash
   # Linux/Mac
   ./scripts/dev-server.sh

   # Windows
   scripts\dev-server.bat
   ```

3. Run the test client:
   ```bash
   cd test-sdk
   bun install
   bun index.js
   ```

## What it does

The test client:

- Connects to the dev server on port 4200
- Creates an agent with REPL tool enabled and most other tools disabled
- Creates a session with test-folder as the working directory
- Asks the agent to use REPL to read test files and return results
- Streams the response to the console

## Test folder contents

- `sample1.txt` - Simple text file
- `sample2.txt` - Another text file with numbers
- `data.json` - JSON file with test data
