"""
tests/routes/test_profile.py
────────────────────────────
Integration tests for profile API routes (Phase 1.2, Items 6+7).

All tests use the `client` fixture from routes/conftest.py which provides:
  - Fresh in-memory SQLite DB
  - Mocked model availability check
  - FastAPI TestClient with real lifespan

Each test that needs a jobsearch.md uses `profile_client` which additionally:
  - Writes a temp jobsearch.md with known content
  - Patches profile_routes._load_config to point at that file
"""

from pathlib import Path

import pytest

import database
import llm_client
import profile_routes


# ─────────────────────────────────────────────────────────────
# Sample content — enough to exercise parse + completion checks
# ─────────────────────────────────────────────────────────────

_COMPLETE_SECTION = (
    "I am a senior software engineer with 10 years of experience building "
    "distributed systems at scale. My defining strengths are systems design, "
    "technical leadership, and cross-functional collaboration."
)

# One complete section (who_i_am), the rest have [FILL] markers
PARTIAL_JOBSEARCH = f"""## 1. Who I Am
{_COMPLETE_SECTION}

## 2. Career Narrative
[FILL — e.g. "I started as a backend engineer..."]

## 3. Career History
[FILL]

## 4. Skills & Strengths
[FILL]

## 5. Target Role Profile
[FILL]

## 6. Resume Master Copy
[FILL]

## 7. Tailoring Rules
[FILL]

## 8. Insights & Lessons
[FILL]

## 9. Model Behavior Rules
[FILL]
"""

EMPTY_JOBSEARCH = ""


# ─────────────────────────────────────────────────────────────
# Fixture — client with a controlled jobsearch.md path
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def profile_client(client, tmp_path, monkeypatch):
    """
    Routes test client with a temp jobsearch.md written and profile_routes patched.
    Returns dict with: client, js_path (Path to the jobsearch file).
    """
    js_path = tmp_path / "jobsearch.md"
    js_path.write_text(PARTIAL_JOBSEARCH, encoding="utf-8")
    monkeypatch.setattr(
        profile_routes,
        "_load_config",
        lambda: {"evaluation": {"jobsearch_md_path": str(js_path)}},
    )
    return {"client": client, "js_path": js_path}


@pytest.fixture
def profile_client_no_file(client, tmp_path, monkeypatch):
    """Routes test client where jobsearch.md does not exist."""
    js_path = tmp_path / "missing_jobsearch.md"
    monkeypatch.setattr(
        profile_routes,
        "_load_config",
        lambda: {"evaluation": {"jobsearch_md_path": str(js_path)}},
    )
    return {"client": client, "js_path": js_path}


@pytest.fixture
def profile_seeded_client(profile_client):
    """profile_client with a default LLM model inserted."""
    server_id = database.create_server("Test Server", "http://localhost:11434", "local")
    model_id = database.insert_llm_model(
        "test-model",
        server_id,
        default_flag=1,
        available=1,
    )
    return {**profile_client, "model_id": model_id}


@pytest.fixture
def profile_seeded_client_no_file(profile_client_no_file):
    """profile_client_no_file with a default LLM model inserted."""
    server_id = database.create_server("Test Server", "http://localhost:11434", "local")
    model_id = database.insert_llm_model(
        "test-model",
        server_id,
        default_flag=1,
        available=1,
    )
    return {**profile_client_no_file, "model_id": model_id}


# ─────────────────────────────────────────────────────────────
# GET /api/v1/profile/health
# ─────────────────────────────────────────────────────────────


class TestProfileHealth:
    def test_health_file_missing(self, profile_client_no_file):
        c = profile_client_no_file["client"]
        r = c.get("/api/v1/profile/health")
        assert r.status_code == 200
        data = r.json()
        assert data["file_exists"] is False
        assert data["completed_sections"] == 0
        assert data["completion_pct"] == 0
        assert len(data["sections"]) == 9
        assert all(not s["complete"] for s in data["sections"])

    def test_health_partial_file(self, profile_client):
        c = profile_client["client"]
        r = c.get("/api/v1/profile/health")
        assert r.status_code == 200
        data = r.json()
        assert data["file_exists"] is True
        assert data["total_sections"] == 9
        # Only who_i_am is complete in our partial fixture
        assert data["completed_sections"] == 1
        assert 0 < data["completion_pct"] < 100
        assert data["token_estimate"] > 0

        who_i_am = next(s for s in data["sections"] if s["id"] == "who_i_am")
        assert who_i_am["complete"] is True

        career_narrative = next(s for s in data["sections"] if s["id"] == "career_narrative")
        assert career_narrative["complete"] is False

    def test_health_returns_all_nine_section_ids(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/health")
        ids = {s["id"] for s in r.json()["sections"]}
        expected = {
            "who_i_am", "career_narrative", "career_history", "skills_strengths",
            "target_role", "resume_master", "tailoring_rules", "insights_lessons",
            "model_behavior",
        }
        assert ids == expected


# ─────────────────────────────────────────────────────────────
# GET /api/v1/profile/sections
# ─────────────────────────────────────────────────────────────


class TestProfileSections:
    def test_sections_returns_content(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/sections")
        assert r.status_code == 200
        data = r.json()
        assert "sections" in data
        assert len(data["sections"]) == 9

    def test_sections_who_i_am_has_content(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/sections")
        sections = {s["id"]: s for s in r.json()["sections"]}
        who = sections["who_i_am"]
        assert who["complete"] is True
        assert _COMPLETE_SECTION in who["content"]

    def test_sections_includes_recommended_mode(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/sections")
        sections = {s["id"]: s for s in r.json()["sections"]}
        assert sections["career_history"]["recommended_mode"] == "socratic"
        assert sections["skills_strengths"]["recommended_mode"] == "directive"
        assert sections["model_behavior"]["recommended_mode"] == "edit_only"

    def test_sections_404_when_file_missing(self, profile_client_no_file):
        r = profile_client_no_file["client"].get("/api/v1/profile/sections")
        assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# PATCH /api/v1/profile/sections/{section_id}
# ─────────────────────────────────────────────────────────────


class TestPatchSection:
    def test_patch_happy_path(self, profile_client):
        c = profile_client["client"]
        js_path = profile_client["js_path"]
        new_content = "I transitioned from academia to industry in 2018 driven by a desire to see my work deployed at scale."

        r = c.patch(
            "/api/v1/profile/sections/career_narrative",
            json={"content": new_content, "note": "test edit"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True
        assert "version_id" in data

        # File on disk should now contain the new content
        updated = js_path.read_text(encoding="utf-8")
        assert new_content in updated

    def test_patch_creates_version_snapshot(self, profile_client):
        c = profile_client["client"]
        original_content = profile_client["js_path"].read_text(encoding="utf-8")

        r = c.patch(
            "/api/v1/profile/sections/career_history",
            json={"content": "New career history content here, long enough.", "note": "AI edit"},
        )
        version_id = r.json()["version_id"]

        # The snapshot should contain the original content
        row = database.get_jobsearch_version_by_id(version_id)
        assert row is not None
        assert row["content"] == original_content
        assert row["note"] == "AI edit"

    def test_patch_invalid_section_id_returns_422(self, profile_client):
        r = profile_client["client"].patch(
            "/api/v1/profile/sections/not_a_real_section",
            json={"content": "anything"},
        )
        assert r.status_code == 422

    def test_patch_preserves_other_sections(self, profile_client):
        c = profile_client["client"]
        js_path = profile_client["js_path"]

        c.patch(
            "/api/v1/profile/sections/career_narrative",
            json={"content": "New career narrative text that is long enough to count."},
        )

        updated = js_path.read_text(encoding="utf-8")
        # who_i_am section content should still be present
        assert _COMPLETE_SECTION in updated

    def test_patch_404_when_file_missing(self, profile_client_no_file):
        r = profile_client_no_file["client"].patch(
            "/api/v1/profile/sections/who_i_am",
            json={"content": "test"},
        )
        assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# GET /api/v1/profile/versions
# GET /api/v1/profile/versions/{version_id}
# ─────────────────────────────────────────────────────────────


class TestProfileVersions:
    def test_versions_empty_initially(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/versions")
        assert r.status_code == 200
        assert r.json() == []

    def test_versions_appear_after_patch(self, profile_client):
        c = profile_client["client"]
        c.patch(
            "/api/v1/profile/sections/who_i_am",
            json={"content": "Updated content that is definitely long enough.", "note": "test"},
        )
        r = c.get("/api/v1/profile/versions")
        versions = r.json()
        assert len(versions) == 1
        assert versions[0]["note"] == "test"

    def test_version_by_id_returns_content(self, profile_client):
        c = profile_client["client"]
        original = profile_client["js_path"].read_text(encoding="utf-8")

        patch_r = c.patch(
            "/api/v1/profile/sections/who_i_am",
            json={"content": "Updated content here.", "note": "snapshot test"},
        )
        version_id = patch_r.json()["version_id"]

        r = c.get(f"/api/v1/profile/versions/{version_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["content"] == original
        assert data["id"] == version_id

    def test_version_not_found(self, profile_client):
        r = profile_client["client"].get("/api/v1/profile/versions/99999")
        assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/restore/{version_id}
# ─────────────────────────────────────────────────────────────


class TestRestoreVersion:
    def test_restore_writes_historical_content(self, profile_client):
        c = profile_client["client"]
        js_path = profile_client["js_path"]
        original = js_path.read_text(encoding="utf-8")

        # Create a version snapshot with the original, then overwrite the file
        patch_r = c.patch(
            "/api/v1/profile/sections/career_narrative",
            json={"content": "New narrative that replaced the original.", "note": "overwrite"},
        )
        version_id = patch_r.json()["version_id"]

        # Restore to that snapshot (which has the original content)
        r = c.post(f"/api/v1/profile/restore/{version_id}")
        assert r.status_code == 200
        assert r.json()["success"] is True

        restored = js_path.read_text(encoding="utf-8")
        assert restored == original

    def test_restore_creates_pre_restore_snapshot(self, profile_client):
        c = profile_client["client"]

        patch_r = c.patch(
            "/api/v1/profile/sections/career_narrative",
            json={"content": "Overwrite content here.", "note": "first edit"},
        )
        version_id = patch_r.json()["version_id"]
        c.post(f"/api/v1/profile/restore/{version_id}")

        versions = c.get("/api/v1/profile/versions").json()
        notes = [v["note"] for v in versions]
        assert "Pre-restore snapshot" in notes

    def test_restore_not_found(self, profile_client):
        r = profile_client["client"].post("/api/v1/profile/restore/99999")
        assert r.status_code == 404


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/chat  (SSE streaming)
# ─────────────────────────────────────────────────────────────


class TestProfileChat:
    def _mock_stream(self, tokens: list[str]):
        """Return an async generator factory that yields the given tokens."""
        async def _gen(*args, **kwargs):
            for t in tokens:
                yield t
        return _gen

    def test_chat_streams_tokens_and_done(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        tokens = ["Hello", " world"]
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(tokens))

        r = c.post(
            "/api/v1/profile/chat",
            json={
                "section_id": "career_history",
                "mode": "socratic",
                "messages": [{"role": "user", "content": "Tell me what to do."}],
                "section_content": "",
            },
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        body = r.text
        assert "data: Hello\n\n" in body
        assert "data:  world\n\n" in body
        assert "data: [DONE]\n\n" in body

    def test_chat_logs_llm_call(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(["hi"]))

        c.post(
            "/api/v1/profile/chat",
            json={
                "section_id": "who_i_am",
                "mode": "directive",
                "messages": [{"role": "user", "content": "Help me."}],
                "section_content": "",
            },
        )
        logs = database.get_llm_call_log(call_type="chat")
        assert len(logs) == 1
        assert dict(logs[0])["success"] == 1

    def test_chat_stream_error_yields_sentinel(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        monkeypatch.setattr(llm_client, "complete_stream", self._mock_stream(["[STREAM_ERROR]"]))

        r = c.post(
            "/api/v1/profile/chat",
            json={
                "section_id": "career_narrative",
                "mode": "socratic",
                "messages": [{"role": "user", "content": "test"}],
                "section_content": "",
            },
        )
        assert "data: [STREAM_ERROR]\n\n" in r.text

    def test_chat_invalid_section_id_returns_422(self, profile_seeded_client):
        r = profile_seeded_client["client"].post(
            "/api/v1/profile/chat",
            json={
                "section_id": "fake_section",
                "mode": "socratic",
                "messages": [{"role": "user", "content": "hi"}],
                "section_content": "",
            },
        )
        assert r.status_code == 422

    def test_chat_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post(
            "/api/v1/profile/chat",
            json={
                "section_id": "career_history",
                "mode": "socratic",
                "messages": [{"role": "user", "content": "hi"}],
                "section_content": "",
            },
        )
        assert r.status_code == 503

    def test_chat_empty_messages_returns_400(self, profile_seeded_client):
        r = profile_seeded_client["client"].post(
            "/api/v1/profile/chat",
            json={
                "section_id": "career_history",
                "mode": "socratic",
                "messages": [],
                "section_content": "",
            },
        )
        assert r.status_code == 400


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/propose-update
# ─────────────────────────────────────────────────────────────


class TestProposeUpdate:
    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_propose_returns_content_and_section_id(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        proposed = "I am a senior engineer with 10 years in distributed systems."
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(proposed))

        r = c.post(
            "/api/v1/profile/propose-update",
            json={
                "section_id": "who_i_am",
                "mode": "directive",
                "messages": [
                    {"role": "user", "content": "I have 10 years experience."},
                    {"role": "assistant", "content": "Tell me more."},
                    {"role": "user", "content": "Senior distributed systems engineer."},
                ],
                "section_content": "",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["proposed_content"] == proposed
        assert data["section_id"] == "who_i_am"

    def test_propose_logs_llm_call(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        monkeypatch.setattr(
            llm_client, "complete", self._mock_complete("Proposed section content here.")
        )
        c.post(
            "/api/v1/profile/propose-update",
            json={
                "section_id": "career_narrative",
                "mode": "directive",
                "messages": [{"role": "user", "content": "draft this for me"}],
                "section_content": "",
            },
        )
        logs = database.get_llm_call_log(call_type="chat")
        assert len(logs) == 1

    def test_propose_invalid_section_returns_422(self, profile_seeded_client):
        r = profile_seeded_client["client"].post(
            "/api/v1/profile/propose-update",
            json={
                "section_id": "not_real",
                "mode": "directive",
                "messages": [{"role": "user", "content": "hi"}],
                "section_content": "",
            },
        )
        assert r.status_code == 422

    def test_propose_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post(
            "/api/v1/profile/propose-update",
            json={
                "section_id": "who_i_am",
                "mode": "directive",
                "messages": [{"role": "user", "content": "hi"}],
                "section_content": "",
            },
        )
        assert r.status_code == 503


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/synthesize-insights
# ─────────────────────────────────────────────────────────────


class TestSynthesizeInsights:
    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_synthesize_returns_proposed_content(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        proposed = "Key insight: I get more callbacks when applying within 24 hours of posting."
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(proposed))

        r = c.post("/api/v1/profile/synthesize-insights")
        assert r.status_code == 200
        data = r.json()
        assert data["proposed_content"] == proposed
        assert data["section_id"] == "insights_lessons"

    def test_synthesize_logs_llm_call(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        monkeypatch.setattr(
            llm_client, "complete", self._mock_complete("Some insights here.")
        )
        c.post("/api/v1/profile/synthesize-insights")
        logs = database.get_llm_call_log(call_type="chat")
        assert len(logs) == 1

    def test_synthesize_includes_application_logs_in_prompt(
        self, profile_seeded_client, monkeypatch
    ):
        c = profile_seeded_client["client"]
        captured_prompts: list[str] = []

        async def _capture_complete(prompt, system, **kwargs):
            captured_prompts.append(prompt)
            return {"success": True, "content": "insights here", "error": None}

        monkeypatch.setattr(llm_client, "complete", _capture_complete)

        # Create a job and application log so synthesize-insights has something to read
        job_id, _ = database.upsert_job("Test Corp", "Engineer", "eng")
        app_row = database.get_application_for_job(job_id)
        type_id = database.get_system_type_id("application_log", "general")
        database.add_application_log(
            application_id=app_row["id"],
            type_id=type_id,
            log="Great call with the recruiter, very positive vibes.",
        )

        c.post("/api/v1/profile/synthesize-insights")
        assert len(captured_prompts) == 1
        assert "general" in captured_prompts[0]
        assert "Great call with the recruiter" in captured_prompts[0]

    def test_synthesize_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post("/api/v1/profile/synthesize-insights")
        assert r.status_code == 503


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/coherence-check
# ─────────────────────────────────────────────────────────────


class TestCoherenceCheck:
    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_coherence_returns_review_and_issues_count(
        self, profile_seeded_client, monkeypatch
    ):
        c = profile_seeded_client["client"]
        review_text = (
            "1. Career Narrative says senior IC but Career History shows management roles.\n"
            "2. Tailoring Rules mention 'B2B SaaS' but Target Role Profile doesn't list it.\n"
            "3. Skills section still has [FILL] markers."
        )
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(review_text))

        r = c.post("/api/v1/profile/coherence-check")
        assert r.status_code == 200
        data = r.json()
        assert data["review"] == review_text
        assert data["issues_found"] == 3

    def test_coherence_sends_full_file_in_prompt(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        captured: list[str] = []

        async def _capture(prompt, system, **kwargs):
            captured.append(prompt)
            return {"success": True, "content": "1. One issue.", "error": None}

        monkeypatch.setattr(llm_client, "complete", _capture)
        c.post("/api/v1/profile/coherence-check")

        assert len(captured) == 1
        # Prompt must contain content from the partial fixture (who_i_am section)
        assert "senior software engineer" in captured[0]

    def test_coherence_404_when_file_missing(self, profile_seeded_client_no_file):
        r = profile_seeded_client_no_file["client"].post("/api/v1/profile/coherence-check")
        assert r.status_code == 404

    def test_coherence_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post("/api/v1/profile/coherence-check")
        assert r.status_code == 503


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/generate-tailoring-rules
# ─────────────────────────────────────────────────────────────


class TestGenerateTailoringRules:
    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_generate_returns_proposed_content(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        proposed = "Always: lead with impact. Never: use passive voice. Voice: direct and confident."
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(proposed))

        r = c.post("/api/v1/profile/generate-tailoring-rules")
        assert r.status_code == 200
        data = r.json()
        assert data["proposed_content"] == proposed
        assert data["section_id"] == "tailoring_rules"

    def test_generate_sends_sections_1_through_5_in_prompt(
        self, profile_seeded_client, monkeypatch
    ):
        c = profile_seeded_client["client"]
        captured: list[str] = []

        async def _capture(prompt, system, **kwargs):
            captured.append(prompt)
            return {"success": True, "content": "Always: lead with impact.", "error": None}

        monkeypatch.setattr(llm_client, "complete", _capture)
        c.post("/api/v1/profile/generate-tailoring-rules")

        assert len(captured) == 1
        prompt = captured[0]
        # Must include all 5 source sections by name
        assert "Who I Am" in prompt
        assert "Career Narrative" in prompt
        assert "Career History" in prompt
        assert "Skills" in prompt
        assert "Target Role" in prompt

    def test_generate_404_when_file_missing(self, profile_seeded_client_no_file):
        r = profile_seeded_client_no_file["client"].post("/api/v1/profile/generate-tailoring-rules")
        assert r.status_code == 404

    def test_generate_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post("/api/v1/profile/generate-tailoring-rules")
        assert r.status_code == 503


# ─────────────────────────────────────────────────────────────
# GET /api/v1/profile/health — edge cases: empty file, complete file
# ─────────────────────────────────────────────────────────────


_COMPLETE_JOBSEARCH = "\n\n".join(
    f"## {i}. {name}\n" + (
        "I am a senior software engineer with over a decade of experience building "
        "distributed systems, leading platform teams, and delivering measurable outcomes "
        "at growth-stage and enterprise companies. My defining strengths are systems design, "
        "technical leadership, and cross-functional collaboration across product and business "
        "stakeholders. I thrive in high-autonomy environments where engineering quality matters."
    )
    for i, name in [
        (1, "Who I Am"),
        (2, "Career Narrative"),
        (3, "Career History"),
        (4, "Skills & Strengths"),
        (5, "Target Role Profile"),
        (6, "Resume Master Copy"),
        (7, "Tailoring Rules"),
        (8, "Insights & Lessons"),
        (9, "Model Behavior Rules"),
    ]
)


class TestProfileHealthEdgeCases:
    def test_health_empty_file(self, client, tmp_path, monkeypatch):
        js_path = tmp_path / "jobsearch.md"
        js_path.write_text("", encoding="utf-8")
        monkeypatch.setattr(
            profile_routes,
            "_load_config",
            lambda: {"evaluation": {"jobsearch_md_path": str(js_path)}},
        )
        r = client.get("/api/v1/profile/health")
        assert r.status_code == 200
        data = r.json()
        assert data["file_exists"] is True
        assert data["completed_sections"] == 0
        assert data["completion_pct"] == 0
        assert len(data["sections"]) == 9
        assert all(not s["complete"] for s in data["sections"])

    def test_health_complete_file(self, client, tmp_path, monkeypatch):
        js_path = tmp_path / "jobsearch.md"
        js_path.write_text(_COMPLETE_JOBSEARCH, encoding="utf-8")
        monkeypatch.setattr(
            profile_routes,
            "_load_config",
            lambda: {"evaluation": {"jobsearch_md_path": str(js_path)}},
        )
        r = client.get("/api/v1/profile/health")
        assert r.status_code == 200
        data = r.json()
        assert data["file_exists"] is True
        assert data["completed_sections"] == 9
        assert data["completion_pct"] == 100
        assert all(s["complete"] for s in data["sections"])


# ─────────────────────────────────────────────────────────────
# POST /api/v1/profile/quality-audit
# ─────────────────────────────────────────────────────────────


class TestQualityAudit:
    def _mock_complete(self, content: str):
        async def _complete(*args, **kwargs):
            return {"success": True, "content": content, "error": None}
        return _complete

    def test_audit_returns_review_and_issues_count(
        self, profile_seeded_client, monkeypatch
    ):
        c = profile_seeded_client["client"]
        review_text = (
            "1. Career History: Role at Acme Corp has only 1 achievement bullet.\n"
            "2. Resume Master Copy: section appears to be a placeholder.\n"
            "3. Tailoring Rules: all entries are still [AUTO] markers.\n"
        )
        monkeypatch.setattr(llm_client, "complete", self._mock_complete(review_text))

        r = c.post("/api/v1/profile/quality-audit")
        assert r.status_code == 200
        data = r.json()
        assert data["review"] == review_text
        assert data["issues_found"] == 3

    def test_audit_sends_full_file_in_prompt(self, profile_seeded_client, monkeypatch):
        c = profile_seeded_client["client"]
        captured: list[str] = []

        async def _capture(prompt, system, **kwargs):
            captured.append(prompt)
            return {"success": True, "content": "1. One issue.", "error": None}

        monkeypatch.setattr(llm_client, "complete", _capture)
        c.post("/api/v1/profile/quality-audit")

        assert len(captured) == 1
        # Prompt must contain content from the partial fixture (who_i_am section is complete)
        assert "senior software engineer" in captured[0]

    def test_audit_zero_issues_when_no_numbered_list(
        self, profile_seeded_client, monkeypatch
    ):
        c = profile_seeded_client["client"]
        monkeypatch.setattr(
            llm_client,
            "complete",
            self._mock_complete("No issues found. The profile looks complete."),
        )
        r = c.post("/api/v1/profile/quality-audit")
        assert r.status_code == 200
        assert r.json()["issues_found"] == 0

    def test_audit_404_when_file_missing(self, profile_seeded_client_no_file):
        r = profile_seeded_client_no_file["client"].post("/api/v1/profile/quality-audit")
        assert r.status_code == 404

    def test_audit_no_model_returns_503(self, profile_client):
        r = profile_client["client"].post("/api/v1/profile/quality-audit")
        assert r.status_code == 503
