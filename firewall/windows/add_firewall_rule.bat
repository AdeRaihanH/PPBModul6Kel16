@echo off
set PORT=5002
set RULE_NAME="Local Backend Server Port %PORT%"

netsh advfirewall firewall add rule name=%RULE_NAME% dir=in action=allow protocol=TCP localport=%PORT%

echo.
echo Firewall rule "%RULE_NAME%" created successfully.
echo.
pause