@echo off
title Git Auto-Push - Emoji Mirror
echo 🚀 Starting the Git Pipeline...

:: This ensures Git uses the saved credentials
git config credential.helper store

:: Step 1: Stage all changes
git add .
echo ✅ Files staged.

:: Step 2: Ask for a commit message
set /p msg="Enter your commit message: "

:: Step 3: Commit the changes
git commit -m "%msg%"
echo ✅ Changes committed.

:: Step 4: Push to GitHub
echo 📤 Pushing to GitHub...
git push origin main

echo.
echo ✨ Success! Your changes are now traveling to Vercel.
pause