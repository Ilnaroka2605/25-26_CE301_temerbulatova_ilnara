import os

# Fake environment values, set BEFORE app.py is imported.
os.environ["GOOGLE_API_KEY"] = "test-key"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id"
os.environ["NEWS_API_KEY"] = "test-news-key"
os.environ["WEATHER_API_KEY"] = "test-weather-key"

import pytest
import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    return app_module.app.test_client()
