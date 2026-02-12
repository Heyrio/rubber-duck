# Rubber Duck - AI Coding Companion

A macOS desktop app that watches your screen while you code and provides voice-based AI assistance using OpenAI's Realtime API and GPT-4o Vision.

## Features

- **Voice Conversations** - Natural back-and-forth with OpenAI Realtime API
- **Screen Awareness** - AI sees your code context via periodic screenshots
- **Floating Overlay** - Always-on-top, draggable, minimal UI
- **System Tray** - Quick access, start/stop listening
- **Hotkey Activation** - Toggle with `Cmd+Shift+D`

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure OpenAI API key:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Run in development mode:**
   ```bash
   npm run electron:dev
   ```

4. **Build for production:**
   ```bash
   npm run electron:build
   ```

## Usage

1. Click the yellow microphone button or press `Cmd+Shift+D` to start listening
2. Talk to the duck about your code or problems
3. The AI will periodically capture your screen to understand context
4. Say "look at this" to trigger an immediate screen capture
5. Click the stop button or press `Cmd+Shift+D` again to stop

## Cost Considerations

- OpenAI Realtime API: ~$0.06/min audio
- GPT-4o Vision: ~$0.01 per screenshot analysis
- With smart triggers: ~$0.50-2/hour (varies by activity)

## Requirements

- macOS (uses native screen capture)
- Node.js 18+
- OpenAI API key with access to:
  - `gpt-4o-realtime-preview` (Realtime API)
  - `gpt-4o` (Vision)

## Permissions

On first run, you'll need to grant:
- **Microphone access** - For voice input
- **Screen Recording** - For screen capture (System Preferences > Privacy & Security > Screen Recording)
