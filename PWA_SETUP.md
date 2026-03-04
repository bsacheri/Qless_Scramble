# Q-Less Scramble - PWA Setup Guide

Your game is now a Progressive Web App (PWA)! This means it can be installed on phones like a native app.

## Files Added

- **manifest.json** - App configuration (name, icons, display mode)
- **service-worker.js** - Enables offline play and app caching
- **Updated HTML** - Meta tags and service worker registration

## How to Deploy & Install

### Option 1: GitHub Pages (Free & Easy) ⭐ Recommended
1. Create a GitHub account (if you don't have one)
2. Create a new repository named `qless-scramble`
3. Upload these files:
   - Qless_Scramble.html
   - manifest.json
   - service-worker.js
4. Go to repository Settings → Pages → Select "main" branch
5. Your app will be live at: `https://yourusername.github.io/qless-scramble/`
6. Open that URL on your phone and tap "Install"

### Option 2: Netlify (Free)
1. Create a Netlify account
2. Drag and drop your files into Netlify
3. Get a live URL instantly
4. Open on your phone and install

### Option 3: Local Testing (Before Deploying)
1. Install a local server (Python, Node, VS Code Live Server extension)
2. Access via `http://localhost:PORT/Qless_Scramble.html`
3. Service Worker works best over HTTPS in production

## Installation Instructions for Users

### On Android
1. Open the game URL in Chrome
2. Look for "Install" prompt at the bottom
3. Tap "Install" → "Install"
4. App appears on home screen

### On iPhone
1. Open the game URL in Safari
2. Tap Share button (square with arrow)
3. Select "Add to Home Screen"
4. Choose a name (or use default)
5. Tap "Add"
6. App appears on home screen

## App Features

✅ Works offline (plays from cache)
✅ Installable on all devices
✅ Full-screen app mode (no browser chrome)
✅ Home screen icon
✅ Auto-updates when you make changes
✅ Fast load times (cached files)

## Tips

- Clear browser cache if you want to force update the cache
- Users auto-get updates; they don't need to reinstall
- Service Worker automatically refreshes the cache when files change

Enjoy! 🎮
