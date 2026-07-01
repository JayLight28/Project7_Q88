@echo off
title Q88 Check Server - DO NOT CLOSE while colleagues are using it
cd /d "%~dp0"
echo Starting the Q88 Check server. This window IS the server - keep it open.
echo Closing this window will disconnect everyone using it.
echo.
python app.py
pause
