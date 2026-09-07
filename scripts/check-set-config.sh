#!/bin/bash
# M1-11: Pre-commit check for banned set_config patterns
# Run: ./scripts/check-set-config.sh

echo "🔍 Checking for banned set_config calls outside withUser helper..."

# Find set_config calls in TypeScript files, excluding allowed locations
BANNED_FILES=$(grep -r "set_config" \
  --include="*.ts" \
  --include="*.tsx" \
  --include="*.js" \
  --include="*.jsx" \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=spikes \
  . | \
  grep -v "lib/db/with-user.ts" | \
  grep -v "tests/" | \
  grep -v "docs/" | \
  grep -v "scripts/") 

if [ -n "$BANNED_FILES" ]; then
  echo "❌ SECURITY VIOLATION: Direct set_config calls found!"
  echo
  echo "$BANNED_FILES"
  echo
  echo "💡 Use withUser() helper from lib/db/with-user.ts instead"
  echo "   See docs/SECURITY-CHECKLIST.md for details"
  exit 1
else
  echo "✅ No banned set_config calls found"
  exit 0
fi