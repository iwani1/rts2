#!/bin/sh
# D-092/7A container entrypoint: apply migrations, then serve.
# `set -e` means a failed migration stops the container instead of
# serving against a stale schema.
set -e
echo "Applying database migrations (prisma migrate deploy)..."
node node_modules/prisma/build/index.js migrate deploy
echo "Starting Richie TMS..."
exec node server.js
