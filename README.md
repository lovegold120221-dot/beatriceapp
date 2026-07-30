<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BeatriceVoice (bvoice)

A conversational AI with real-time voice interaction using Gemini Live API, Firebase auth, and real-time voice.

## Features

- Real-time voice conversation with Gemini Live API
- AudioWorklet-based audio processing with VAD
- Natural interruption handling with acknowledgments
- Firebase authentication and chat history
- 5-bar Pluto-inspired audio visualizer
- Tasker agent function calling
- Natural turn-taking and conversation flow

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to AI Studio

This app is designed to be deployed from Google AI Studio.
