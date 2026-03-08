#!/usr/bin/env bash
# Record a demo of the mdzilla interactive CLI using asciinema + expect
set -euo pipefail

cd "$(dirname "$0")/.."

CAST_FILE="demo.cast"

EXPECT_SCRIPT=$(mktemp /tmp/mdzilla-demo.XXXXX.exp)
cat > "$EXPECT_SCRIPT" << 'EXPECT'
#!/usr/bin/env expect
set timeout 10

spawn node src/cli.ts test/docs

# Wait for the CLI to fully render (footer contains "quit")
expect "quit"

# Helper: send a key and wait for redraw
proc sendkey {key {delay 0.4}} {
  send $key
  expect -re ".+"
  sleep $delay
}

# Down arrow 5 times
for {set i 0} {$i < 5} {incr i} {
  sendkey "\x1b\[B" 0.3
  sleep 1
}

# Tab to switch to content pane
sendkey "\t" 1

# Down arrow 10 times rapidly
for {set i 0} {$i < 10} {incr i} {
  sendkey "\x1b\[B" 0.5
}

# Press G (go to bottom)
sendkey "G" 0.5

# Tab back to sidebar
sendkey "\t" 0.3

# Search: type / then "neste" then Enter
sendkey "/" 0.3
send "neste"
expect -re ".+"
sleep 0.5
sendkey "\r" 0.5

# Search again: / then "hono" then Escape
sendkey "/" 0.3
send "hono"
expect -re ".+"
sleep 0.5
sendkey "\x1b" 0.5

# Quit
send "q"
expect eof
EXPECT

echo "Recording demo to $CAST_FILE..."
asciinema rec "$CAST_FILE" \
  --cols 100 \
  --rows 30 \
  --command "expect $EXPECT_SCRIPT" \
  --overwrite

rm -f "$EXPECT_SCRIPT"
echo "Done! Play with: asciinema play $CAST_FILE"
