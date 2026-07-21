from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from dotenv import load_dotenv
from google import genai
from google.genai import types
from datetime import datetime
import os
import base64
import json
import re
import requests
from flask_login import LoginManager, login_user, UserMixin, login_required, logout_user

# Load environment variables from .env
load_dotenv()

# Initialize the Gemini client
api_key = os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY")
if not app.secret_key:
    raise RuntimeError("SECRET_KEY is not set. Add it to your .env file (see .env.example).")

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)

class User(UserMixin):
    def __init__(self, id_, name, email):
        self.id = id_
        self.name = name
        self.email = email

users = {}

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

@app.route("/auth/google", methods=["POST"])
def google_login():
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests

    token = request.json.get("credential")

    try:
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), os.getenv("GOOGLE_CLIENT_ID"))
        userid = idinfo['sub']
        name = idinfo['name']
        email = idinfo['email']

        if userid not in users:
            users[userid] = User(userid, name, email)
        login_user(users[userid])
        session["google_token"] = request.json.get("access_token")
        return jsonify({"success": True, "name": name, "email": email})

    except ValueError:
        return jsonify({"success": False, "message": "Invalid token"}), 400

@app.route("/dashboard")
@login_required
def dashboard():
    return f"Hello, {users[session['_user_id']].name}! Welcome to your AI assistant."

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect("/")

@app.route("/")
def home():
    return render_template("index.html")


def parse_structured_reply(raw_text):
    try:
        match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not match:
            return raw_text, []
        data = json.loads(match.group(0))
        reply = data.get("reply", raw_text)
        suggestions = data.get("suggestions", [])
        if not isinstance(suggestions, list):
            suggestions = []
        return reply, suggestions[:3]
    except Exception:
        return raw_text, []


@app.route("/chat", methods=["POST"])
def chat():
    try:
        user_message = request.json.get("message", "")
        history = request.json.get("history", [])
        # Optional image/file attachment from drag-and-drop:
        # { data: "<base64 no prefix>", mime_type: "image/png" }
        attachment = request.json.get("attachment")

        if "weather" in user_message.lower() and not attachment:
            words = user_message.split()
            location = None
            for i, word in enumerate(words):
                if word.lower() == "in" and i + 1 < len(words):
                    location = " ".join(words[i+1:])
                    break

            if location:
                weather_data = get_weather(location)
                if "error" in weather_data:
                    bot_reply = f"⚠️ Could not get weather: {weather_data['error']}"
                else:
                    bot_reply = (
                        f"Weather in {weather_data['location']}:\n"
                        f"Temperature: {weather_data['temp_c']}°C\n"
                        f"Condition: {weather_data['condition']}"
                    )
                return jsonify({"reply": bot_reply, "suggestions": []})
            else:
                return jsonify({"reply": "Please specify the city. For example: 'What's the weather in London?'", "suggestions": []})

        # Build context from history
        context = ""
        for msg in history[-6:]:
            role = "User" if msg["sender"] == "user" else "Assistant"
            context += f"{role}: {msg['text']}\n"

        current_dt = datetime.now().strftime("%A, %B %d, %Y, %H:%M")

        instructions = (
            f"Today's actual date and time is {current_dt}. Use this when answering any question "
            "about the current date, day, or time.\n\n"
            "Respond ONLY with a single JSON object, no markdown fences, no extra text, in this exact shape:\n"
            '{"reply": "<your answer, markdown allowed inside the string>", '
            '"suggestions": ["<short follow-up 1>", "<short follow-up 2>", "<short follow-up 3>"]}\n'
            "The suggestions are short follow-up questions or actions the user might want next, "
            "written from the user's point of view (e.g. \"Explain simpler\", \"Show code example\").\n\n"
        )

        prompt_text = f"{instructions}{context}User: {user_message}\nAssistant:"

        # Build multimodal content: text plus an optional image/file part
        parts = [prompt_text]
        if attachment and attachment.get("data") and attachment.get("mime_type"):
            file_bytes = base64.b64decode(attachment["data"])
            parts.append(types.Part.from_bytes(data=file_bytes, mime_type=attachment["mime_type"]))

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=parts
        )

        bot_reply, suggestions = parse_structured_reply(response.text.strip())
        return jsonify({"reply": bot_reply, "suggestions": suggestions})

    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"reply": f"Error: {str(e)}", "suggestions": []})


@app.route("/generate-image", methods=["POST"])
def generate_image():
    try:
        prompt = request.json.get("prompt", "")
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400

        response = client.models.generate_content(
            model="gemini-2.0-flash-preview-image-generation",
            contents=prompt,
            config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
        )

        image_b64 = None
        text_part = ""
        for part in response.candidates[0].content.parts:
            if getattr(part, "inline_data", None) is not None:
                image_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
            elif getattr(part, "text", None):
                text_part += part.text

        if not image_b64:
            return jsonify({"error": "The model didn't return an image. " + text_part})

        return jsonify({"image": image_b64, "mime_type": "image/png", "text": text_part})

    except Exception as e:
        print(f"Image generation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/news", methods=["POST"])
def news():
    try:
        query = request.json.get("query", "latest")
        news_api_key = os.getenv("NEWS_API_KEY")
        url = f"https://newsapi.org/v2/everything?q={query}&apiKey={news_api_key}"

        response = requests.get(url)
        data = response.json()

        if data.get("status") != "ok":
            return jsonify({"news": "Sorry, I can't fetch news right now."})

        articles = data.get("articles", [])[:5]
        news_result = ""

        for art in articles:
            news_result += f"🔹 **{art['title']}**\n"
            news_result += f"{art['description']}\n"
            news_result += f"{art['url']}\n\n"

        return jsonify({"news": news_result})

    except Exception as e:
        return jsonify({"news": f"Error: {str(e)}"})

def get_weather(location):
    weather_api_key = os.getenv("WEATHER_API_KEY")
    url = f"http://api.weatherapi.com/v1/current.json?key={weather_api_key}&q={location}"

    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        return {
            "location": f"{data['location']['name']}, {data['location']['country']}",
            "temp_c": data['current']['temp_c'],
            "condition": data['current']['condition']['text']
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(debug=debug_mode)