# Vibeless - AI Coding Companion

A macOS desktop app that watches your screen in real-time while you code and provides voice-based AI assistance using Google Gemini Live API.

## Features

- **Real-time Screen Sharing** - AI sees your screen live at 1 fps
- **Voice Conversations** - Natural back-and-forth with Gemini Live API
- **Floating Overlay** - Always-on-top, draggable, minimal UI
- **System Tray** - Quick access, start/stop listening
- **Hotkey Activation** - Toggle with `Cmd+Shift+D`
- **Multi-monitor Support** - Follows you across screens and spaces

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Gemini API key:**
   ```bash
   cp .env.example .env
   # Edit .env and add your Gemini API key
   ```

   Get your key from: https://aistudio.google.com/app/apikey

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Usage

1. Click the microphone button or press `Cmd+Shift+D` to start
2. Talk to Vibeless about your code or problems
3. The AI sees your screen in real-time as you work
4. Click the stop button or press `Cmd+Shift+D` again to stop

## Requirements

- macOS (uses native screen capture)
- Node.js 18+
- Google Gemini API key

## Permissions

On first run, you'll need to grant:
- **Microphone access** - For voice input
- **Screen Recording** - For screen capture (System Preferences > Privacy & Security > Screen Recording)
