@echo off
cd /d "%~dp0"
echo Starting Computerised Embroidery site...
echo.
echo   Shop:       http://localhost:8765
echo   Designer:   http://localhost:8765/designer.html
echo   Production: http://localhost:8765/admin.html
echo.
echo Press Ctrl+C to stop the server.
echo.
node server.js