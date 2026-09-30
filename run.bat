@echo off
echo ===================================================
echo               Starting STRATA
echo    Interactive Composite Materials Platform
echo ===================================================
echo.
echo Launching server on http://localhost:5000...
start "" http://localhost:5000
python server.py
pause
