#!/usr/bin/env python3
"""End-to-end demo of the pinemail-mcp tools, simulating an agentic e2e test.

Spawns `pinemail-mcp` as a subprocess and talks JSON-RPC 2.0 to it over stdio,
exactly like an MCP-aware coding agent (Claude/Copilot/Cursor) would:

  1. initialize                          - handshake
  2. tools/list                          - discover available tools
  3. tools/call send_test_email          - simulate "the app under test sent an email"
  4. tools/call wait_for_email           - the real agentic pattern: block until it arrives
  5. tools/call extract_signals          - pull the OTP code / link out of the body
  6. tools/call delete_email             - clean up

Requires a running pinemail server (default http://127.0.0.1:8025) and the
pinemail-mcp binary built (`cargo build --release -p pinemail-mcp`).

Usage:
    PINEMAIL_URL=http://127.0.0.1:8025 python3 examples/mcp_e2e_demo.py \
        [path/to/pinemail-mcp]
"""

import json
import os
import subprocess
import sys
import time

BIN = sys.argv[1] if len(sys.argv) > 1 else "target/release/pinemail-mcp"


class McpClient:
    def __init__(self, binary_path: str):
        env = {**os.environ}
        self.proc = subprocess.Popen(
            [binary_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
        )
        self._next_id = 1

    def call(self, method: str, params: dict | None = None) -> dict:
        request_id = self._next_id
        self._next_id += 1
        request = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(json.dumps(request) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        response = json.loads(line)
        if "error" in response:
            raise RuntimeError(f"{method} failed: {response['error']}")
        return response["result"]

    def call_tool(self, name: str, arguments: dict | None = None) -> dict:
        result = self.call("tools/call", {"name": name, "arguments": arguments or {}})
        if result.get("isError"):
            raise RuntimeError(f"tool {name} failed: {result}")
        return json.loads(result["content"][0]["text"])

    def close(self):
        self.proc.stdin.close()
        self.proc.wait(timeout=5)


def main() -> None:
    client = McpClient(BIN)
    try:
        info = client.call("initialize")
        print(f"connected to {info['serverInfo']['name']} v{info['serverInfo']['version']}")

        tools = client.call("tools/list")["tools"]
        print(f"discovered {len(tools)} tools: {', '.join(t['name'] for t in tools)}")

        to_address = "agent-test@example.com"

        # Capture "since" *before* triggering the action: wait_for_email only matches
        # mail received after this timestamp, so grabbing it too late would miss an
        # email that arrives in the gap between triggering and calling wait_for_email.
        since_ms = int(time.time() * 1000)

        print(f"\n1. simulating the app under test sending mail to {to_address} ...")
        client.call_tool("send_test_email", {"to": to_address})

        print("2. waiting for it to arrive (this is the pattern a real e2e test uses) ...")
        message = client.call_tool(
            "wait_for_email",
            {"to": to_address, "subject": "Test email", "since_ms": since_ms, "timeout_ms": 10_000},
        )
        print(f"   received: \"{message['subject']}\" from {message['from']}")

        print("3. extracting codes/links from the body ...")
        signals = client.call_tool("extract_signals", {"id": message["id"]})
        print(f"   codes: {signals['codes']}  links: {signals['links']}")

        print("4. cleaning up ...")
        client.call_tool("delete_email", {"id": message["id"]})
        print("   deleted. demo complete.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
