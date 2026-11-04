@echo off
set PORT=5002
set RULE_NAME="Local Backend Server Port %PORT%"

netsh advfirewall firewall delete rule name=%RULE_NAME% dir=in protocol=TCP localport=%PORT%

echo.
echo Firewall rule "%RULE_NAME%" deleted successfully.
echo.
pause