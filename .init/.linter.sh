#!/bin/bash
cd /home/kavia/workspace/code-generation/responsive-web-chess-game-314861-314875/chess_game_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

