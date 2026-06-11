"""Unit tests for standalone utility functions in main.py."""

from main import strip_utm_params


class TestStripUtmParams:
    def test_none_input_returns_none(self):
        assert strip_utm_params(None) is None

    def test_empty_string_returns_empty(self):
        assert strip_utm_params("") == ""

    def test_url_without_utm_unchanged(self):
        url = "https://example.com/jobs/123?ref=board&source=web"
        assert strip_utm_params(url) == url

    def test_utm_only_params_removed(self):
        url = "https://example.com/jobs/123?utm_source=linkedin&utm_medium=cpc&utm_campaign=q1"
        result = strip_utm_params(url)
        assert result == "https://example.com/jobs/123"

    def test_mixed_params_removes_utm_keeps_others(self):
        url = "https://example.com/apply?ref=board&utm_source=linkedin&utm_campaign=q1&job_id=99"
        result = strip_utm_params(url)
        assert "utm_source" not in result
        assert "utm_campaign" not in result
        assert "ref=board" in result
        assert "job_id=99" in result

    def test_url_with_no_query_string_unchanged(self):
        url = "https://example.com/jobs/123"
        assert strip_utm_params(url) == url

    def test_utm_case_insensitive(self):
        url = "https://example.com/?UTM_SOURCE=test&UTM_MEDIUM=email"
        result = strip_utm_params(url)
        assert result == "https://example.com/"
