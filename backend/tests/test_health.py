"""Smoke tests for the health endpoint."""
from fastapi.testclient import TestClient

from coffee_journal.main import app


def test_health_check():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert "database" in payload
