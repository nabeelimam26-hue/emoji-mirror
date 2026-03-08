@echo off
title Git Auto-Push - Emoji Mirror
echo Starting the Git Pipeline...

:: 1. Cleanup and Sync
if exist username_pass.txt del username_pass.txt
git config --global credential.helper store
git pull origin main --rebase

:: 2. Stage all changes
git add .
echo Files staged.

:: 3. Message and Push
set /p msg="Enter your commit message: "
git commit -m "%msg%"
echo Pushing to GitHub...
git push origin main

echo.
echo Success! Your changes are traveling to Vercel.
pause