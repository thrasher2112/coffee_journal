"""Smoke tests for the health endpoint."""
from coffee_journal.main import app
from fastapi.testclient import TestClient


def test_health_check():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "database" in payload
