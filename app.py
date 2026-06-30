from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from dotenv import load_dotenv
from google import genai
import os
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

# Custom User class required by Flask-Login
# Stores minimal user info (id, name, email)
class User(UserMixin):
    def __init__(self, id_, name, email):
        self.id = id_
        self.name = name
        self.email = email

# Temporary in-memory user storage, not for production use
users = {}
# Flask-Login uses this to reload user from session
@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

# Google login route (frontend will POST credential token here)
@app.route("/auth/google", methods=["POST"])
def google_login():
    # Handles Google OAuth login.
    # Verifies token received from frontend and logs user in.
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests

    token = request.json.get("credential")
    access_token = request.json.get("access_token")
    
    try:
        # Verify token authenticity with Google
        idinfo = id_token.verify_oauth2_token(token, grequests.Request(), os.getenv("GOOGLE_CLIENT_ID"))
        userid = idinfo['sub']
        name = idinfo['name']
        email = idinfo['email']

        # Store user if not exists
        if userid not in users:
            users[userid] = User(userid, name, email)
        # Log the user into session
        login_user(users[userid])
        session["google_token"]= request.json.get("access_token")
        return jsonify({"success": True, "name": name, "email": email})

    except ValueError:
        return jsonify({"success": False, "message": "Invalid token"}), 400

# Protected dashboard route example
@app.route("/dashboard")
@login_required
def dashboard():
    # Only accessible if user is logged in
    return f"Hello, {users[session['_user_id']].name}! Welcome to your AI assistant."

# Logout
@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect("/")

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/chat", methods=["POST"])
def chat():
    try:
        user_message = request.json.get("message", "")
        history = request.json.get("history", [])

        # Check if the user is asking about weather
        if "weather" in user_message.lower():
            # Try to extract city after 'in'
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
            else:
                bot_reply = "Please specify the city. For example: 'What's the weather in London?'"

        else:
            # Build context from history
            context = ""
            for msg in history[-6:]:  # last 6 messages for context
                role = "User" if msg["sender"] == "user" else "Assistant"
                context += f"{role}: {msg['text']}\n"

            # Add current message
            prompt = f"{context}User: {user_message}\nAssistant:"

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            bot_reply = response.text.strip()

        return jsonify({"reply": bot_reply})

    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"reply": f"Error: {str(e)}"})
    
@app.route("/news", methods=["POST"])
def news():
    # Fetches latest news using NewsAPI based on user query
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
    # Calls external Weather API to get real-time weather data
    weather_api_key = os.getenv("WEATHER_API_KEY")  # from your .env
    url = f"http://api.weatherapi.com/v1/current.json?key={weather_api_key}&q={location}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        weather_info = {
            "location": f"{data['location']['name']}, {data['location']['country']}",
            "temp_c": data['current']['temp_c'],
            "condition": data['current']['condition']['text']
        }
        return weather_info
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    # Debug mode reads from .env so it's off by default.
    # Set FLASK_DEBUG=True in your local .env for development.
    debug_mode = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(debug=debug_mode)