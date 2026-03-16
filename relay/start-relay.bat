@echo off
title Task Enterprise - Host Relay (Port 3099)
echo Starting Windows Host Relay on port 3099...
echo This must stay running for Dame to control the desktop.
echo.
node "%~dp0relay.js"
pause
