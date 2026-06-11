"""
tests/routes/test_scrape.py
Integration tests for the scrape routes.

Routes covered:
  POST /api/v1/scrape
  POST /api/v1/scrape/fill-gaps
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

import database


RICH_HTML = """
<html><head><title>Senior Engineer at Acme</title></head><body>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Senior Software Engineer",
  "hiringOrganization": {"@type": "Organization", "name": "Acme Corp"},
  "jobLocation": {"@type": "Place", "address": {"addressLocality": "San Francisco"}},
  "baseSalary": {"currency": "USD", "value": {"minValue": 150000, "maxValue": 200000}},
  "jobLocationType": "TELECOMMUTE"
}
</script>
<h1>Senior Software Engineer</h1>
<p>We are looking for an experienced engineer to join our team.</p>
</body></html>
"""

SHORT_MARKDOWN = "Short"

FULL_MARKDOWN = " ".join(["word"] * 200)


def _crawl4ai_response(markdown: str, html: str) -> dict:
    return {"results": [{"markdown": markdown, "html": html}]}


# ─────────────────────────────────────────────────────────────
# POST /api/v1/scrape
# ─────────────────────────────────────────────────────────────

class TestScrapeUrl:
    def test_success_returns_scraped_fields(self, client):
        mock_result = _crawl4ai_response(FULL_MARKDOWN, RICH_HTML)
        with (
            patch("scrape_routes._get_crawl4ai_base_url", return_value="http://crawl:11235"),
            patch("scrape_routes._fetch_crawl4ai", new=AsyncMock(return_value=mock_result["results"][0])),
        ):
            resp = client.post("/api/v1/scrape", json={"url": "https://example.com/job"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["title"] == "Senior Software Engineer"
        assert data["company"] == "Acme Corp"
        assert data["location"] == "San Francisco"
        assert data["pay_band"] == "USD150000–USD200000"
        assert data["remote_type"] == "Remote"
        assert data["scrape_quality"] == "full"
        assert data["apply_url"] == "https://example.com/job"
        assert len(data["jd_text"].split()) >= 100

    def test_partial_quality_when_markdown_short(self, client):
        mock_result = _crawl4ai_response(SHORT_MARKDOWN, "<html></html>")
        with (
            patch("scrape_routes._get_crawl4ai_base_url", return_value="http://crawl:11235"),
            patch("scrape_routes._fetch_crawl4ai", new=AsyncMock(return_value=mock_result["results"][0])),
        ):
            resp = client.post("/api/v1/scrape", json={"url": "https://example.com/job"})

        assert resp.status_code == 200
        assert resp.json()["scrape_quality"] == "partial"

    def test_crawl4ai_unavailable_returns_graceful_error(self, client):
        import httpx as httpx_module
        with (
            patch("scrape_routes._get_crawl4ai_base_url", return_value="http://crawl:11235"),
            patch(
                "scrape_routes._fetch_crawl4ai",
                new=AsyncMock(side_effect=httpx_module.ConnectError("unreachable")),
            ),
        ):
            resp = client.post("/api/v1/scrape", json={"url": "https://example.com/job"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "unavailable" in data["error"].lower()
        assert data["jd_text"] == ""

    def test_no_base_url_configured_returns_graceful_error(self, client):
        with patch("scrape_routes._get_crawl4ai_base_url", return_value=None):
            resp = client.post("/api/v1/scrape", json={"url": "https://example.com/job"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["jd_text"] == ""


# ─────────────────────────────────────────────────────────────
# POST /api/v1/scrape/fill-gaps
# ─────────────────────────────────────────────────────────────

class TestFillGaps:
    def test_fills_null_fields_from_llm(self, seeded_client):
        llm_response = json.dumps({
            "title": "Director of Engineering",
            "company": "BigCo",
            "location": "Austin, TX",
            "remote_type": "Hybrid",
            "pay_band": "$180k–$220k",
        })
        mock_llm = AsyncMock(return_value={
            "success": True,
            "content": llm_response,
            "model": "test-model",
            "provider": "local",
            "latency_ms": 500,
            "prompt_tokens_actual": 100,
            "completion_tokens_actual": 50,
            "total_tokens_actual": 150,
            "error": None,
        })
        with patch("scrape_routes.llm_client.complete", mock_llm):
            resp = seeded_client["client"].post(
                "/api/v1/scrape/fill-gaps",
                json={
                    "jd_text": "We need an experienced engineering leader to join our team...",
                    "title": None,
                    "company": None,
                    "location": None,
                    "remote_type": None,
                    "pay_band": None,
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Director of Engineering"
        assert data["company"] == "BigCo"
        assert data["remote_type"] == "Hybrid"
        assert data["error"] is None

    def test_fill_gaps_writes_llm_call_log(self, seeded_client):
        llm_response = json.dumps({"title": "Staff Engineer", "company": None, "location": None, "remote_type": None, "pay_band": None})
        mock_llm = AsyncMock(return_value={
            "success": True,
            "content": llm_response,
            "model": "test-model",
            "provider": "local",
            "latency_ms": 400,
            "prompt_tokens_actual": 80,
            "completion_tokens_actual": 30,
            "total_tokens_actual": 110,
            "error": None,
        })
        with patch("scrape_routes.llm_client.complete", mock_llm):
            seeded_client["client"].post(
                "/api/v1/scrape/fill-gaps",
                json={"jd_text": "Senior IC role.", "title": None},
            )

        rows = database.get_llm_call_log(limit=5)
        assert any(r["call_type"] == "extraction" for r in rows)

    def test_fill_gaps_normalizes_invalid_remote_type(self, seeded_client):
        llm_response = json.dumps({
            "title": "Engineer",
            "company": "Co",
            "location": "NY",
            "remote_type": "fully remote",  # not a valid enum value
            "pay_band": None,
        })
        mock_llm = AsyncMock(return_value={
            "success": True,
            "content": llm_response,
            "model": "test-model",
            "provider": "local",
            "latency_ms": 300,
            "prompt_tokens_actual": 60,
            "completion_tokens_actual": 20,
            "total_tokens_actual": 80,
            "error": None,
        })
        with patch("scrape_routes.llm_client.complete", mock_llm):
            resp = seeded_client["client"].post(
                "/api/v1/scrape/fill-gaps",
                json={"jd_text": "Some job.", "remote_type": None},
            )

        assert resp.status_code == 200
        # invalid remote_type must be coerced to null
        assert resp.json()["remote_type"] is None

    def test_fill_gaps_no_model_configured_returns_error(self, client):
        resp = client.post(
            "/api/v1/scrape/fill-gaps",
            json={"jd_text": "Some job.", "title": None},
        )
        assert resp.status_code == 200
        assert resp.json()["error"] == "No LLM model configured"
