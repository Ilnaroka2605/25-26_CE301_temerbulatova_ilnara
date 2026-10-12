import app as app_module
from app import parse_structured_reply


# ---------- helper classes ----------

class FakeResponse:
    """Stands in for a requests.Response or a Gemini response."""
    def __init__(self, json_data=None, text=""):
        self._json = json_data
        self.text = text

    def json(self):
        return self._json

    def raise_for_status(self):
        pass


class FakeGeminiClient:
    def __init__(self, text=None, error=None):
        self.models = self
        self._text = text
        self._error = error

    def generate_content(self, **kwargs):
        if self._error:
            raise self._error
        return FakeResponse(text=self._text)


# ---------- parse_structured_reply ----------

def test_parse_valid_json():
    raw = '{"reply": "Hello", "suggestions": ["a", "b"]}'
    reply, suggestions = parse_structured_reply(raw)
    assert reply == "Hello"
    assert suggestions == ["a", "b"]


def test_parse_plain_text_falls_back():
    reply, suggestions = parse_structured_reply("just text")
    assert reply == "just text"
    assert suggestions == []


def test_parse_broken_json_falls_back():
    reply, suggestions = parse_structured_reply("{not valid json}")
    assert reply == "{not valid json}"
    assert suggestions == []


def test_parse_limits_to_three_suggestions():
    raw = '{"reply": "x", "suggestions": ["1", "2", "3", "4", "5"]}'
    _, suggestions = parse_structured_reply(raw)
    assert len(suggestions) == 3


def test_parse_non_list_suggestions_ignored():
    raw = '{"reply": "x", "suggestions": "oops"}'
    _, suggestions = parse_structured_reply(raw)
    assert suggestions == []


# ---------- /chat ----------

def test_chat_returns_gemini_reply(client, monkeypatch):
    fake = FakeGeminiClient(text='{"reply": "Hi there", "suggestions": ["More"]}')
    monkeypatch.setattr(app_module, "client", fake)
    res = client.post("/chat", json={"message": "hello", "history": []})
    assert res.status_code == 200
    assert res.get_json()["reply"] == "Hi there"
    assert res.get_json()["suggestions"] == ["More"]


def test_chat_handles_gemini_error(client, monkeypatch):
    fake = FakeGeminiClient(error=RuntimeError("API down"))
    monkeypatch.setattr(app_module, "client", fake)
    res = client.post("/chat", json={"message": "hello", "history": []})
    assert "Error" in res.get_json()["reply"]


def test_chat_weather_success(client, monkeypatch):
    monkeypatch.setattr(app_module, "get_weather", lambda loc: {
        "location": "London, United Kingdom", "temp_c": 12, "condition": "Cloudy"})
    res = client.post("/chat", json={"message": "What's the weather in London?"})
    reply = res.get_json()["reply"]
    assert "London" in reply
    assert "12" in reply


def test_chat_weather_without_city_asks_for_city(client):
    res = client.post("/chat", json={"message": "weather please"})
    assert "specify the city" in res.get_json()["reply"]


def test_chat_weather_api_error(client, monkeypatch):
    monkeypatch.setattr(app_module, "get_weather", lambda loc: {"error": "bad key"})
    res = client.post("/chat", json={"message": "weather in Paris"})
    assert "Could not get weather" in res.get_json()["reply"]


# ---------- get_weather ----------

def test_get_weather_parses_response(monkeypatch):
    payload = {
        "location": {"name": "Leeds", "country": "United Kingdom"},
        "current": {"temp_c": 9.5, "condition": {"text": "Rain"}},
    }
    monkeypatch.setattr(app_module.requests, "get",
                        lambda url: FakeResponse(json_data=payload))
    result = app_module.get_weather("Leeds")
    assert result == {"location": "Leeds, United Kingdom",
                      "temp_c": 9.5, "condition": "Rain"}


def test_get_weather_returns_error_on_failure(monkeypatch):
    def boom(url):
        raise ConnectionError("no network")
    monkeypatch.setattr(app_module.requests, "get", boom)
    assert "error" in app_module.get_weather("Leeds")


# ---------- /news ----------

def test_news_formats_articles(client, monkeypatch):
    payload = {"status": "ok", "articles": [
        {"title": "Big News", "description": "Details", "url": "http://x.com"}]}
    monkeypatch.setattr(app_module.requests, "get",
                        lambda url: FakeResponse(json_data=payload))
    res = client.post("/news", json={"query": "tech"})
    assert "Big News" in res.get_json()["news"]


def test_news_handles_api_failure(client, monkeypatch):
    monkeypatch.setattr(app_module.requests, "get",
                        lambda url: FakeResponse(json_data={"status": "error"}))
    res = client.post("/news", json={"query": "tech"})
    assert "can't fetch news" in res.get_json()["news"]


# ---------- other routes ----------

def test_home_page_loads(client):
    assert client.get("/").status_code == 200


def test_generate_image_requires_prompt(client):
    res = client.post("/generate-image", json={"prompt": ""})
    assert res.status_code == 400


def test_dashboard_requires_login(client):
    res = client.get("/dashboard")
    assert res.status_code in (401, 302)


def test_google_login_rejects_invalid_token(client, monkeypatch):
    from google.oauth2 import id_token

    def bad_token(*args, **kwargs):
        raise ValueError("bad token")
    monkeypatch.setattr(id_token, "verify_oauth2_token", bad_token)
    res = client.post("/auth/google", json={"credential": "fake"})
    assert res.status_code == 400
    assert res.get_json()["success"] is False
