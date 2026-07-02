# AURA - Conversational AI Chatbot

A Flask-based conversational AI assistant ("AURA") powered by Google's Gemini model, with a web chat UI, Google OAuth login, weather and news lookups, and a companion Telegram bot.

## Features
- Chat interface backed by Gemini (`gemini-2.5-flash`)
- Google Sign-In
- Weather lookups ("what's the weather in London?")
- News lookups via NewsAPI
- Saved messages and per-conversation chat history (stored in browser localStorage)
- Telegram bot front-end that talks to the same Flask backend

## Project Structure
```
.
├── app.py                 # Flask app and API routes
├── telegram_bot.py        # Telegram bot, forwards messages to /chat
├── requirements.txt
├── templates/
│   └── index.html
├── static/
│   ├── css/style2.css
│   └── js/script.js
└── .env
```

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Run the web app:
   ```bash
   python app.py
   ```
   Visit `http://127.0.0.1:5000`.

3. Run the Telegram bot in a separate terminal, with the Flask app already running:
   ```bash
   python telegram_bot.py
   ```

## Known limitations
- User accounts are stored in memory (`users = {}` in `app.py`), so they reset every time the server restarts - fine for a demo, not for production.
- Weather city detection is a simple "city follows the word 'in'" parse, so phrasing like "London weather" won't be picked up.

## Weekly Progress Log
- Week 0-1 (Release 0.0): Project selection and supervisor approval
- Week 2-3 (Release 1.0): Challenge Week Deliverables
- Week 4-6 (Release 2.0): Core Architecture
- Week 7-9 (Release 3.0): Basic Chatbot Functionality
- Week 10-11 (Release 4.0): Full demo version & presentation
- Week 12-15 (Release 5.0): Winter break improvements
