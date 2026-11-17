#!/bin/sh
# Chrome for WSL without system packages: point LD_LIBRARY_PATH at extracted libs.
export LD_LIBRARY_PATH=/home/imprint/opt/chromelibs/usr/lib/x86_64-linux-gnu
exec /home/imprint/opt/chrome/opt/google/chrome/chrome "$@"
