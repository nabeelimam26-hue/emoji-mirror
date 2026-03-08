@echo off
:: Navigate to your project folder (if the script isn't already inside it)
cd /d "C:\Users\ADMIN\Desktop\emoji-mirror"

:: 'git add -A' ensures all new folders, deleted files, and changes are tracked
git add -A

:: Use a clear commit message so you know this was the big modular refactor
git commit -m "Refactor: Modular structure with lerp-based smooth movement"

:: Push to your main branch
git push origin main

echo.
echo ?? Changes pushed! Vercel is now building your "Smooth-as-Water" update.
pause