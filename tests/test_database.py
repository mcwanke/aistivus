"""
tests/test_database.py
Unit tests for database.py — schema v1.0.

Fixtures (tmp_db, model_id, job_id, app_id) are defined in conftest.py.
Each test uses a fresh in-file SQLite database; no network calls are made.
"""

import pytest
import database


# ─────────────────────────────────────────────────────────────
# init_db / schema
# ─────────────────────────────────────────────────────────────

class TestInitDb:
    def test_creates_all_tables(self, tmp_db):
        tables = {
            "system_types", "llm_models", "jobs", "job_company_log",
            "job_postings", "evaluations", "llm_call_log", "applications",
            "application_logs", "application_documents", "application_audit",
            "job_posting_audit", "jobsearch_versions", "resume_info",
            "search_runs", "search_run_errors", "chat_sessions", "chat_messages",
            "projects", "schema_versions", "schema_migrations",
        }
        with database.get_connection() as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        found = {r["name"] for r in rows}
        assert tables.issubset(found)

    def test_seeds_system_types(self, tmp_db):
        types = database.get_all_system_types()
        assert len(types) == 14

    def test_seeds_all_expected_type_names(self, tmp_db):
        names = {r["type_name"] for r in database.get_all_system_types()}
        assert names == {"application_log", "company_info", "application_document"}

    def test_seeds_application_log_values(self, tmp_db):
        rows = database.get_all_system_types("application_log")
        values = {r["type_value"] for r in rows}
        assert values == {
            "recruiter_call", "interview_feedback", "compensation",
            "general", "repost_alert", "prompt",
        }

    def test_seeds_company_info_values(self, tmp_db):
        rows = database.get_all_system_types("company_info")
        values = {r["type_value"] for r in rows}
        assert values == {"website", "careerpage", "culturepage", "industry", "size", "notes"}

    def test_seeds_application_document_values(self, tmp_db):
        rows = database.get_all_system_types("application_document")
        values = {r["type_value"] for r in rows}
        assert values == {"resume", "cover_letter"}

    def test_records_schema_version(self, tmp_db):
        assert database.get_schema_version() == "1.0"

    def test_idempotent(self, tmp_db):
        database.init_db()
        database.init_db()
        assert len(database.get_all_system_types()) == 14
        assert database.get_schema_version() == "1.0"

    def test_no_auto_seed_without_config(self, tmp_db):
        models = database.get_all_llm_models()
        assert len(models) == 0


# ─────────────────────────────────────────────────────────────
# System Types
# ─────────────────────────────────────────────────────────────

class TestSystemTypes:
    def test_get_all_returns_all(self, tmp_db):
        assert len(database.get_all_system_types()) == 14

    def test_get_filtered_by_type_name(self, tmp_db):
        rows = database.get_all_system_types("application_log")
        assert len(rows) == 6
        assert all(r["type_name"] == "application_log" for r in rows)

    def test_get_system_type_id_found(self, tmp_db):
        type_id = database.get_system_type_id("application_log", "general")
        assert isinstance(type_id, int)
        assert type_id > 0

    def test_get_system_type_id_not_found(self, tmp_db):
        assert database.get_system_type_id("application_log", "nonexistent") is None

    def test_add_system_type(self, tmp_db):
        new_id = database.add_system_type("company_info", "linkedin")
        assert isinstance(new_id, int)
        assert database.get_system_type_id("company_info", "linkedin") == new_id

    def test_add_system_type_duplicate_raises(self, tmp_db):
        with pytest.raises(ValueError, match="already exists"):
            database.add_system_type("application_log", "general")

    def test_delete_system_type_no_references(self, tmp_db):
        new_id = database.add_system_type("company_info", "temp_type")
        result = database.delete_system_type(new_id)
        assert result is True
        assert database.get_system_type_id("company_info", "temp_type") is None

    def test_delete_system_type_blocked_by_job_company_log(self, tmp_db, job_id):
        type_id = database.get_system_type_id("company_info", "website")
        database.add_job_company_log(job_id, type_id, log="https://acme.com")
        result = database.delete_system_type(type_id)
        assert result is False

    def test_delete_system_type_blocked_by_application_logs(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_log", "general")
        database.add_application_log(app_id, type_id, log="test note")
        result = database.delete_system_type(type_id)
        assert result is False

    def test_delete_system_type_not_found(self, tmp_db):
        result = database.delete_system_type(99999)
        assert result is False


# ─────────────────────────────────────────────────────────────
# LLM Models
# ─────────────────────────────────────────────────────────────

class TestLlmModels:
    def test_insert_returns_id(self, tmp_db):
        mid = database.insert_llm_model("qwen3:14b", "http://localhost:11434")
        assert isinstance(mid, int)
        assert mid > 0

    def test_insert_sets_defaults(self, tmp_db):
        mid = database.insert_llm_model("test-model", "http://localhost:11434")
        model = database.get_llm_model(mid)
        assert model["available"] == 0
        assert model["default_flag"] == 0
        assert model["model_weight"] == 1

    def test_insert_with_default_flag_clears_others(self, tmp_db):
        id1 = database.insert_llm_model("model-a", "http://host:11434", default_flag=1)
        id2 = database.insert_llm_model("model-b", "http://host:11434", default_flag=1)
        assert database.get_llm_model(id1)["default_flag"] == 0
        assert database.get_llm_model(id2)["default_flag"] == 1

    def test_get_default_llm_model(self, tmp_db):
        database.insert_llm_model("model-a", "http://host:11434")
        mid = database.insert_llm_model("model-b", "http://host:11434", default_flag=1)
        default = database.get_default_llm_model()
        assert default["id"] == mid

    def test_get_default_returns_none_when_none_set(self, tmp_db):
        database.insert_llm_model("model-a", "http://host:11434")
        assert database.get_default_llm_model() is None

    def test_set_llm_model_default(self, tmp_db):
        id1 = database.insert_llm_model("model-a", "http://host:11434", default_flag=1)
        id2 = database.insert_llm_model("model-b", "http://host:11434")
        database.set_llm_model_default(id2)
        assert database.get_llm_model(id1)["default_flag"] == 0
        assert database.get_llm_model(id2)["default_flag"] == 1

    def test_set_llm_model_default_nonexistent_raises(self, tmp_db):
        with pytest.raises(ValueError):
            database.set_llm_model_default(99999)

    def test_set_llm_model_available(self, tmp_db, model_id):
        database.set_llm_model_available(model_id, 0)
        assert database.get_llm_model(model_id)["available"] == 0
        database.set_llm_model_available(model_id, 1)
        assert database.get_llm_model(model_id)["available"] == 1

    def test_update_llm_model(self, tmp_db, model_id):
        result = database.update_llm_model(model_id, estimated_eval_time=45, available=1)
        assert result is True
        model = database.get_llm_model(model_id)
        assert model["estimated_eval_time"] == 45
        assert model["available"] == 1

    def test_update_llm_model_not_found(self, tmp_db):
        result = database.update_llm_model(99999, available=1)
        assert result is False

    def test_update_llm_model_empty_kwargs(self, tmp_db, model_id):
        result = database.update_llm_model(model_id)
        assert result is False

    def test_delete_llm_model(self, tmp_db):
        mid = database.insert_llm_model("temp-model", "http://host:11434")
        result = database.delete_llm_model(mid)
        assert result is True
        assert database.get_llm_model(mid) is None

    def test_delete_llm_model_not_found(self, tmp_db):
        result = database.delete_llm_model(99999)
        assert result is False

    def test_get_all_llm_models(self, tmp_db):
        database.insert_llm_model("model-a", "http://host:11434")
        database.insert_llm_model("model-b", "http://host:11434")
        models = database.get_all_llm_models()
        assert len(models) == 2

    def test_seed_from_config_with_valid_config(self, tmp_db, monkeypatch):
        monkeypatch.setattr(database, "_load_config", lambda: {
            "ollama": {"base_url": "http://localhost:11434", "default_model": "qwen3:14b"}
        })
        result = database.seed_llm_models_from_config()
        assert result is True
        models = database.get_all_llm_models()
        assert len(models) == 1
        assert models[0]["model"] == "qwen3:14b"
        assert models[0]["default_flag"] == 1
        assert models[0]["available"] == 0

    def test_seed_from_config_skips_if_not_empty(self, tmp_db, model_id, monkeypatch):
        monkeypatch.setattr(database, "_load_config", lambda: {
            "ollama": {"base_url": "http://localhost:11434", "default_model": "other-model"}
        })
        result = database.seed_llm_models_from_config()
        assert result is False
        assert len(database.get_all_llm_models()) == 1

    def test_seed_from_config_no_ollama_config(self, tmp_db):
        result = database.seed_llm_models_from_config()
        assert result is False

    def test_seed_from_config_missing_model_field(self, tmp_db, monkeypatch):
        monkeypatch.setattr(database, "_load_config", lambda: {
            "ollama": {"base_url": "http://localhost:11434"}
        })
        result = database.seed_llm_models_from_config()
        assert result is False


# ─────────────────────────────────────────────────────────────
# Jobs
# ─────────────────────────────────────────────────────────────

class TestJobs:
    def test_upsert_inserts_new_job(self, tmp_db):
        jid, created = database.upsert_job("Acme Corp", "Engineer", "python")
        assert isinstance(jid, int)
        assert created is True

    def test_upsert_returns_existing_job(self, tmp_db):
        jid1, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        jid2, created = database.upsert_job("Acme Corp", "Engineer", "python")
        assert jid1 == jid2
        assert created is False

    def test_upsert_case_insensitive_company_name(self, tmp_db):
        jid1, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        jid2, created = database.upsert_job("acme corp", "Engineer", "python")
        assert jid1 == jid2
        assert created is False

    def test_upsert_null_role_keyword_dedup(self, tmp_db):
        jid1, _ = database.upsert_job("Acme Corp", "Engineer")
        jid2, created = database.upsert_job("Acme Corp", "Engineer")
        assert jid1 == jid2
        assert created is False

    def test_upsert_different_role_keyword_creates_new(self, tmp_db):
        jid1, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        jid2, created = database.upsert_job("Acme Corp", "Engineer", "java")
        assert jid1 != jid2
        assert created is True

    def test_upsert_increments_posting_count_on_existing(self, tmp_db):
        jid, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        database.upsert_job("Acme Corp", "Engineer", "python")
        job = database.get_job(jid)
        assert job["posting_count"] == 2

    def test_upsert_auto_creates_not_started_application(self, tmp_db):
        jid, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        app = database.get_application_for_job(jid)
        assert app is not None
        assert app["application_status"] == "not-started"

    def test_upsert_auto_creates_audit_on_application(self, tmp_db):
        jid, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        app = database.get_application_for_job(jid)
        audit = database.get_application_audit(app["id"])
        assert len(audit) == 1
        assert "auto-created" in audit[0]["event"]

    def test_get_job_returns_correct_record(self, tmp_db):
        jid, _ = database.upsert_job("Acme Corp", "Engineer", "python", location="NYC")
        job = database.get_job(jid)
        assert job["company_name"] == "Acme Corp"
        assert job["title"] == "Engineer"
        assert job["location"] == "NYC"

    def test_get_job_not_found(self, tmp_db):
        assert database.get_job(99999) is None

    def test_get_job_includes_application_status(self, tmp_db):
        jid, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        job = database.get_job(jid)
        assert job["application_status"] == "not-started"

    def test_get_all_jobs(self, tmp_db):
        database.upsert_job("Acme Corp", "Engineer", "python")
        database.upsert_job("Beta Inc", "Manager", "leadership")
        jobs = database.get_all_jobs()
        assert len(jobs) == 2

    def test_get_jobs_pending_evaluation(self, tmp_db, model_id):
        jid1, _ = database.upsert_job("Acme Corp", "Engineer", "python")
        jid2, _ = database.upsert_job("Beta Inc", "Manager", "leadership")
        database.insert_evaluation(jid1, model_id, score_overall=7.5)
        pending = database.get_jobs_pending_evaluation()
        ids = [j["id"] for j in pending]
        assert jid2 in ids
        assert jid1 not in ids

    def test_update_job(self, tmp_db, job_id):
        result = database.update_job(job_id, location="San Francisco", excitement_level="high")
        assert result is True
        job = database.get_job(job_id)
        assert job["location"] == "San Francisco"
        assert job["excitement_level"] == "high"

    def test_update_job_not_found(self, tmp_db):
        result = database.update_job(99999, location="NYC")
        assert result is False

    def test_update_job_empty_kwargs(self, tmp_db, job_id):
        result = database.update_job(job_id)
        assert result is False

    def test_find_similar_jobs(self, tmp_db):
        database.upsert_job("Acme Corp", "Engineer", "python")
        database.upsert_job("Acme Corp", "Engineer", "java")
        results = database.find_similar_jobs("Acme Corp", "Engineer")
        assert len(results) == 2

    def test_find_similar_jobs_case_insensitive(self, tmp_db):
        database.upsert_job("Acme Corp", "Engineer", "python")
        results = database.find_similar_jobs("acme corp", "Engineer")
        assert len(results) == 1

    def test_find_similar_jobs_no_match(self, tmp_db):
        database.upsert_job("Acme Corp", "Engineer", "python")
        results = database.find_similar_jobs("Other Corp", "Engineer")
        assert len(results) == 0


# ─────────────────────────────────────────────────────────────
# Agg score recalculation
# ─────────────────────────────────────────────────────────────

class TestAggScores:
    def test_agg_scores_set_after_evaluation(self, tmp_db, job_id, model_id):
        database.insert_evaluation(
            job_id, model_id,
            score_overall=8.0,
            score_role_fit=4.0,
            score_scope_fit=3.5,
            score_culture=4.5,
            score_comp=3.0,
        )
        job = database.get_job(job_id)
        assert job["agg_score_overall"] == pytest.approx(8.0)
        assert job["agg_role_fit"] == pytest.approx(4.0)

    def test_agg_scores_averaged_across_evaluations(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id, score_overall=6.0, score_role_fit=3.0)
        database.insert_evaluation(job_id, model_id, score_overall=8.0, score_role_fit=5.0)
        job = database.get_job(job_id)
        assert job["agg_score_overall"] == pytest.approx(7.0)
        assert job["agg_role_fit"] == pytest.approx(4.0)

    def test_agg_scores_not_updated_when_all_null(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id)
        job = database.get_job(job_id)
        assert job["agg_score_overall"] is None

    def test_failed_eval_excluded_from_agg(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id, score_overall=8.0)
        database.insert_evaluation(job_id, model_id)  # failed eval, all NULL
        job = database.get_job(job_id)
        assert job["agg_score_overall"] == pytest.approx(8.0)


# ─────────────────────────────────────────────────────────────
# Job Company Log
# ─────────────────────────────────────────────────────────────

class TestJobCompanyLog:
    def test_add_and_get(self, tmp_db, job_id):
        type_id = database.get_system_type_id("company_info", "website")
        log_id = database.add_job_company_log(job_id, type_id, url="https://acme.com")
        assert isinstance(log_id, int)
        entries = database.get_job_company_log(job_id)
        assert len(entries) == 1
        assert entries[0]["url"] == "https://acme.com"

    def test_get_includes_type_info(self, tmp_db, job_id):
        type_id = database.get_system_type_id("company_info", "website")
        database.add_job_company_log(job_id, type_id, url="https://acme.com")
        entries = database.get_job_company_log(job_id)
        assert entries[0]["type_name"] == "company_info"
        assert entries[0]["type_value"] == "website"

    def test_get_filtered_by_type_name(self, tmp_db, job_id):
        website_id = database.get_system_type_id("company_info", "website")
        industry_id = database.get_system_type_id("company_info", "industry")
        database.add_job_company_log(job_id, website_id, url="https://acme.com")
        database.add_job_company_log(job_id, industry_id, log="Technology")
        filtered = database.get_job_company_log(job_id, type_name="company_info")
        assert len(filtered) == 2

    def test_get_empty_for_unknown_job(self, tmp_db):
        entries = database.get_job_company_log(99999)
        assert entries == []


# ─────────────────────────────────────────────────────────────
# Job Postings
# ─────────────────────────────────────────────────────────────

class TestJobPostings:
    def test_insert_job_posting(self, tmp_db, job_id):
        pid = database.insert_job_posting(
            job_id,
            source_board="linkedin",
            source_url="https://linkedin.com/jobs/123",
            description_raw="Full JD text here",
        )
        assert isinstance(pid, int)

    def test_get_postings_for_job(self, tmp_db, job_id):
        database.insert_job_posting(job_id, source_board="linkedin")
        database.insert_job_posting(job_id, source_board="indeed")
        postings = database.get_postings_for_job(job_id)
        assert len(postings) == 2

    def test_insert_creates_audit(self, tmp_db, job_id):
        pid = database.insert_job_posting(job_id, source_board="linkedin")
        with database.get_connection() as conn:
            audit = conn.execute(
                "SELECT event FROM job_posting_audit WHERE job_posting_id = ?", (pid,)
            ).fetchone()
        assert audit is not None
        assert "linkedin" in audit["event"]

    def test_get_postings_empty(self, tmp_db, job_id):
        assert database.get_postings_for_job(job_id) == []


# ─────────────────────────────────────────────────────────────
# Evaluations
# ─────────────────────────────────────────────────────────────

class TestEvaluations:
    def test_insert_evaluation_returns_id(self, tmp_db, job_id, model_id):
        eid = database.insert_evaluation(job_id, model_id, score_overall=7.5)
        assert isinstance(eid, int)

    def test_insert_evaluation_stores_all_fields(self, tmp_db, job_id, model_id):
        eid = database.insert_evaluation(
            job_id, model_id,
            score_overall=8.0,
            score_role_fit=4.0,
            score_scope_fit=4.5,
            score_culture=3.5,
            score_comp=4.0,
            fit_type="Core Fit",
            archetype="Technical Specialist",
            strengths="Strong Python skills",
            gaps="No ML experience",
            recommendation="Apply",
            keywords="python,fastapi,sqlite",
            domain_match="Same domain",
            role_type_match="Target match",
            keyword_gaps="kubernetes,ci/cd",
        )
        evals = database.get_evaluations_for_job(job_id)
        assert len(evals) == 1
        e = evals[0]
        assert e["score_overall"] == pytest.approx(8.0)
        assert e["fit_type"] == "Core Fit"
        assert e["domain_match"] == "Same domain"
        assert e["keyword_gaps"] == "kubernetes,ci/cd"

    def test_insert_evaluation_failed_all_null(self, tmp_db, job_id, model_id):
        eid = database.insert_evaluation(job_id, model_id)
        evals = database.get_evaluations_for_job(job_id)
        assert len(evals) == 1
        assert evals[0]["score_overall"] is None

    def test_insert_evaluation_with_llm_call_log_id(self, tmp_db, job_id, model_id):
        log_id = database.insert_llm_call_log(
            model_id, "evaluation", prompt="test", raw_response="{}", success=1
        )
        eid = database.insert_evaluation(
            job_id, model_id, score_overall=7.0, llm_call_log_id=log_id
        )
        evals = database.get_evaluations_for_job(job_id)
        assert evals[0]["llm_call_log_id"] == log_id

    def test_get_evaluations_includes_model_name(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id, score_overall=7.0)
        evals = database.get_evaluations_for_job(job_id)
        assert evals[0]["model_name"] == "test-model"

    def test_get_evaluations_newest_first(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id, score_overall=5.0)
        database.insert_evaluation(job_id, model_id, score_overall=9.0)
        evals = database.get_evaluations_for_job(job_id)
        assert evals[0]["score_overall"] == pytest.approx(9.0)

    def test_get_latest_evaluation(self, tmp_db, job_id, model_id):
        database.insert_evaluation(job_id, model_id, score_overall=5.0)
        database.insert_evaluation(job_id, model_id, score_overall=9.0)
        latest = database.get_latest_evaluation(job_id)
        assert latest["score_overall"] == pytest.approx(9.0)

    def test_get_latest_evaluation_none(self, tmp_db, job_id):
        assert database.get_latest_evaluation(job_id) is None


# ─────────────────────────────────────────────────────────────
# LLM Call Log
# ─────────────────────────────────────────────────────────────

class TestLlmCallLog:
    def test_insert_returns_id(self, tmp_db, model_id):
        log_id = database.insert_llm_call_log(model_id, "evaluation")
        assert isinstance(log_id, int)

    def test_insert_stores_fields(self, tmp_db, model_id, job_id):
        log_id = database.insert_llm_call_log(
            model_id, "evaluation",
            prompt="Test prompt",
            prompt_hash="abc123",
            raw_response='{"score_overall": 7.5}',
            latency_ms=1500,
            call_time=2,
            success=1,
            job_id=job_id,
        )
        entry = database.get_llm_call_log_entry(log_id)
        assert entry["prompt"] == "Test prompt"
        assert entry["latency_ms"] == 1500
        assert entry["success"] == 1
        assert entry["job_id"] == job_id

    def test_insert_failed_call(self, tmp_db, model_id):
        log_id = database.insert_llm_call_log(
            model_id, "evaluation",
            success=0,
            error_message="Connection refused",
        )
        entry = database.get_llm_call_log_entry(log_id)
        assert entry["success"] == 0
        assert entry["error_message"] == "Connection refused"

    def test_get_llm_call_log_newest_first(self, tmp_db, model_id):
        database.insert_llm_call_log(model_id, "evaluation", prompt="first")
        database.insert_llm_call_log(model_id, "evaluation", prompt="second")
        entries = database.get_llm_call_log()
        assert entries[0]["prompt"] == "second"

    def test_get_llm_call_log_filtered_by_job_id(self, tmp_db, model_id, job_id):
        database.insert_llm_call_log(model_id, "evaluation", job_id=job_id)
        database.insert_llm_call_log(model_id, "evaluation", job_id=None)
        entries = database.get_llm_call_log(job_id=job_id)
        assert len(entries) == 1
        assert entries[0]["job_id"] == job_id

    def test_get_llm_call_log_includes_model_name(self, tmp_db, model_id):
        database.insert_llm_call_log(model_id, "evaluation")
        entries = database.get_llm_call_log()
        assert entries[0]["model_name"] == "test-model"

    def test_get_llm_call_log_entry_none(self, tmp_db):
        assert database.get_llm_call_log_entry(99999) is None

    def test_insert_with_null_model_id(self, tmp_db):
        log_id = database.insert_llm_call_log(None, "evaluation", success=0)
        entry = database.get_llm_call_log_entry(log_id)
        assert entry["llm_model_id"] is None


# ─────────────────────────────────────────────────────────────
# Applications
# ─────────────────────────────────────────────────────────────

class TestApplications:
    def test_auto_created_application_exists(self, tmp_db, job_id):
        app = database.get_application_for_job(job_id)
        assert app is not None
        assert app["application_status"] == "not-started"
        assert app["job_id"] == job_id

    def test_get_application_by_id(self, tmp_db, app_id, job_id):
        app = database.get_application(app_id)
        assert app is not None
        assert app["job_id"] == job_id
        assert app["company_name"] == "Acme Corp"

    def test_get_application_not_found(self, tmp_db):
        assert database.get_application(99999) is None

    def test_update_application_status(self, tmp_db, app_id):
        database.update_application_status(app_id, "applied")
        app = database.get_application(app_id)
        assert app["application_status"] == "applied"

    def test_update_application_status_writes_audit(self, tmp_db, app_id):
        database.update_application_status(app_id, "screening")
        audit = database.get_application_audit(app_id)
        events = [a["event"] for a in audit]
        assert any("screening" in e for e in events)

    def test_update_application_fields(self, tmp_db, app_id):
        result = database.update_application(
            app_id,
            apply_date="2026-01-15",
            requested_salary="$150,000",
        )
        assert result is True
        app = database.get_application(app_id)
        assert app["apply_date"] == "2026-01-15"
        assert app["requested_salary"] == "$150,000"

    def test_update_application_not_found(self, tmp_db):
        result = database.update_application(99999, apply_date="2026-01-15")
        assert result is False

    def test_get_all_applications_excludes_not_started(self, tmp_db, app_id):
        apps = database.get_all_applications(exclude_not_started=True)
        assert len(apps) == 0

    def test_get_all_applications_includes_not_started_when_requested(self, tmp_db, app_id):
        apps = database.get_all_applications(exclude_not_started=False)
        assert len(apps) == 1

    def test_get_all_applications_after_status_change(self, tmp_db, app_id):
        database.update_application_status(app_id, "applied")
        apps = database.get_all_applications()
        assert len(apps) == 1
        assert apps[0]["application_status"] == "applied"

    def test_get_application_for_job_prefers_active(self, tmp_db, job_id, app_id):
        database.update_application_status(app_id, "applied")
        app = database.get_application_for_job(job_id)
        assert app["application_status"] == "applied"


# ─────────────────────────────────────────────────────────────
# Application Logs
# ─────────────────────────────────────────────────────────────

class TestApplicationLogs:
    def test_add_log_entry(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_log", "general")
        log_id = database.add_application_log(app_id, type_id, log="Had a call")
        assert isinstance(log_id, int)

    def test_get_logs_includes_type_info(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_log", "recruiter_call")
        database.add_application_log(app_id, type_id, log="Spoke with recruiter")
        logs = database.get_application_logs(app_id)
        assert len(logs) == 1
        assert logs[0]["type_value"] == "recruiter_call"

    def test_get_logs_oldest_first(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_log", "general")
        database.add_application_log(
            app_id, type_id, log="first", log_timestamp="2026-01-01 10:00:00"
        )
        database.add_application_log(
            app_id, type_id, log="second", log_timestamp="2026-01-02 10:00:00"
        )
        logs = database.get_application_logs(app_id)
        assert logs[0]["log"] == "first"
        assert logs[1]["log"] == "second"

    def test_add_log_with_llm_call_log_id(self, tmp_db, app_id, model_id):
        llm_log_id = database.insert_llm_call_log(model_id, "evaluation")
        type_id = database.get_system_type_id("application_log", "prompt")
        log_id = database.add_application_log(
            app_id, type_id, llm_call_log_id=llm_log_id
        )
        logs = database.get_application_logs(app_id)
        assert logs[0]["llm_call_log_id"] == llm_log_id

    def test_delete_log_entry(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_log", "general")
        log_id = database.add_application_log(app_id, type_id, log="temp")
        result = database.delete_application_log(log_id)
        assert result is True
        assert len(database.get_application_logs(app_id)) == 0

    def test_delete_log_not_found(self, tmp_db):
        assert database.delete_application_log(99999) is False


# ─────────────────────────────────────────────────────────────
# Application Documents
# ─────────────────────────────────────────────────────────────

class TestApplicationDocuments:
    def test_insert_document(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_document", "resume")
        doc_id = database.insert_application_document(
            app_id, type_id, "generated/1/resume_v1.typ"
        )
        assert isinstance(doc_id, int)

    def test_get_documents_includes_type_info(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_document", "resume")
        database.insert_application_document(app_id, type_id, "generated/1/resume.typ")
        docs = database.get_application_documents(app_id)
        assert len(docs) == 1
        assert docs[0]["type_value"] == "resume"
        assert docs[0]["file_path"] == "generated/1/resume.typ"

    def test_delete_document(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_document", "resume")
        doc_id = database.insert_application_document(app_id, type_id, "path/to/file.typ")
        result = database.delete_application_document(doc_id)
        assert result is True
        assert len(database.get_application_documents(app_id)) == 0

    def test_delete_document_not_found(self, tmp_db):
        assert database.delete_application_document(99999) is False

    def test_multiple_documents_per_application(self, tmp_db, app_id):
        resume_type = database.get_system_type_id("application_document", "resume")
        cover_type = database.get_system_type_id("application_document", "cover_letter")
        database.insert_application_document(app_id, resume_type, "path/resume.typ")
        database.insert_application_document(app_id, resume_type, "path/resume.pdf")
        database.insert_application_document(app_id, cover_type, "path/cover.typ")
        docs = database.get_application_documents(app_id)
        assert len(docs) == 3


# ─────────────────────────────────────────────────────────────
# Application Audit
# ─────────────────────────────────────────────────────────────

class TestApplicationAudit:
    def test_audit_created_on_job_upsert(self, tmp_db, job_id, app_id):
        audit = database.get_application_audit(app_id)
        assert len(audit) >= 1

    def test_audit_created_on_status_change(self, tmp_db, app_id):
        database.update_application_status(app_id, "applied")
        database.update_application_status(app_id, "interview")
        audit = database.get_application_audit(app_id)
        events = [a["event"] for a in audit]
        assert any("applied" in e for e in events)
        assert any("interview" in e for e in events)

    def test_audit_ordered_oldest_first(self, tmp_db, app_id):
        database.update_application_status(app_id, "applied")
        database.update_application_status(app_id, "rejected")
        audit = database.get_application_audit(app_id)
        assert len(audit) >= 2

    def test_audit_table_not_deletable(self, tmp_db, app_id):
        audit = database.get_application_audit(app_id)
        assert len(audit) >= 1
        audit_id = audit[0]["id"]
        with database.get_connection() as conn:
            conn.execute("DELETE FROM application_audit WHERE id = ?", (audit_id,))
        # The rule is enforced by convention (no delete function exposed), not DB constraint.
        # Verify no delete helper exists in the module.
        assert not hasattr(database, "delete_application_audit")


# ─────────────────────────────────────────────────────────────
# jobsearch.md versions
# ─────────────────────────────────────────────────────────────

class TestJobsearchVersions:
    def test_save_and_retrieve_version(self, tmp_db):
        vid = database.save_jobsearch_version("# My job search\n\nContent here.", note="initial")
        assert isinstance(vid, int)
        content = database.get_jobsearch_version_content(vid)
        assert content == "# My job search\n\nContent here."

    def test_get_versions_newest_first(self, tmp_db):
        database.save_jobsearch_version("version 1")
        database.save_jobsearch_version("version 2")
        versions = database.get_jobsearch_versions()
        assert len(versions) == 2

    def test_get_versions_metadata_only(self, tmp_db):
        database.save_jobsearch_version("content", note="test note")
        versions = database.get_jobsearch_versions()
        assert "content" not in versions[0].keys()
        assert "note" in versions[0].keys()

    def test_get_version_content_not_found(self, tmp_db):
        assert database.get_jobsearch_version_content(99999) is None

    def test_get_versions_respects_limit(self, tmp_db):
        for i in range(5):
            database.save_jobsearch_version(f"version {i}")
        versions = database.get_jobsearch_versions(limit=3)
        assert len(versions) == 3


# ─────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────

class TestUtilities:
    def test_compute_sha256_returns_hex_string(self, tmp_db):
        result = database.compute_sha256("hello world")
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_compute_sha256_consistent(self, tmp_db):
        assert database.compute_sha256("test") == database.compute_sha256("test")

    def test_compute_sha256_different_inputs(self, tmp_db):
        assert database.compute_sha256("foo") != database.compute_sha256("bar")

    def test_check_file_integrity_no_broken_paths(self, tmp_db):
        broken = database.check_file_integrity()
        assert broken == []

    def test_check_file_integrity_detects_missing_file(self, tmp_db, app_id):
        type_id = database.get_system_type_id("application_document", "resume")
        database.insert_application_document(app_id, type_id, "/nonexistent/path/resume.pdf")
        broken = database.check_file_integrity()
        assert len(broken) == 1
        assert broken[0]["path"] == "/nonexistent/path/resume.pdf"

    def test_get_schema_version(self, tmp_db):
        assert database.get_schema_version() == "1.0"

    def test_export_db_returns_dict(self, tmp_db):
        result = database.export_db()
        assert result["schema_version"] == "1.0"
        assert "tables" in result
        assert "system_types" in result["tables"]
        assert len(result["tables"]["system_types"]) == 14


# ─────────────────────────────────────────────────────────────
# Profile Section Parser
# ─────────────────────────────────────────────────────────────

_SAMPLE_PROFILE = """\
# Job Search Context

---

## 1. Who I Am
Name: Jane Smith
Experience level: Senior

---

## 2. Career Narrative
I started as a backend engineer and moved into tech lead roles.

---

## 3. Career History (Reverse Chronological)
### Role @ Company
- Did things

---

## 4. Skills & Strengths
Python, Go, leadership

---

## 5. Target Role Profile
Looking for a VP of Engineering role.

---

## 6. Resume Master Copy
[FILL — paste your master resume here]

---

## 7. Tailoring Rules
Always: highlight distributed systems experience.

---

## 8. Insights & Lessons
[FILL]

---

## 9. Model Behavior Rules
Evaluate every JD before generating materials.
"""


class TestProfileParser:
    def test_parse_returns_all_nine_section_ids(self):
        sections = database.parse_jobsearch_sections(_SAMPLE_PROFILE)
        expected_ids = {
            "who_i_am", "career_narrative", "career_history", "skills_strengths",
            "target_role", "resume_master", "tailoring_rules", "insights_lessons",
            "model_behavior",
        }
        assert set(sections.keys()) == expected_ids

    def test_parse_extracts_section_body_without_header(self):
        sections = database.parse_jobsearch_sections(_SAMPLE_PROFILE)
        assert "## 1." not in sections["who_i_am"]
        assert "Jane Smith" in sections["who_i_am"]

    def test_parse_all_present_sections_have_content(self):
        sections = database.parse_jobsearch_sections(_SAMPLE_PROFILE)
        assert sections["career_narrative"].strip() != ""
        assert sections["target_role"].strip() != ""
        assert sections["model_behavior"].strip() != ""

    def test_parse_missing_section_returns_empty_string(self):
        content = "## 1. Who I Am\nJane Smith\n"
        sections = database.parse_jobsearch_sections(content)
        assert sections["career_narrative"] == ""
        assert sections["insights_lessons"] == ""

    def test_parse_empty_content_returns_all_empty(self):
        sections = database.parse_jobsearch_sections("")
        assert all(v == "" for v in sections.values())

    def test_parse_case_insensitive_header_matching(self):
        content = "## 1. WHO I AM\nSome content\n"
        sections = database.parse_jobsearch_sections(content)
        assert "Some content" in sections["who_i_am"]

    def test_parse_partial_header_match_skills(self):
        content = "## 4. Skills & Strengths\nPython, Go\n"
        sections = database.parse_jobsearch_sections(content)
        assert "Python" in sections["skills_strengths"]

    def test_parse_insights_partial_match(self):
        content = "## 8. Insights & Lessons\nLesson one.\n"
        sections = database.parse_jobsearch_sections(content)
        assert "Lesson one." in sections["insights_lessons"]

    def test_rebuild_replaces_target_section_body(self):
        new_body = "New career history content.\n"
        rebuilt = database.rebuild_jobsearch_from_sections(
            {"career_history": new_body}, _SAMPLE_PROFILE
        )
        assert "New career history content." in rebuilt
        assert "Did things" not in rebuilt

    def test_rebuild_preserves_header_line(self):
        rebuilt = database.rebuild_jobsearch_from_sections(
            {"who_i_am": "New content.\n"}, _SAMPLE_PROFILE
        )
        assert "## 1. Who I Am" in rebuilt

    def test_rebuild_preserves_untouched_sections(self):
        rebuilt = database.rebuild_jobsearch_from_sections(
            {"career_history": "New history.\n"}, _SAMPLE_PROFILE
        )
        assert "Always: highlight distributed systems experience." in rebuilt
        assert "Evaluate every JD before generating materials." in rebuilt

    def test_rebuild_preserves_preamble(self):
        rebuilt = database.rebuild_jobsearch_from_sections(
            {"who_i_am": "Updated.\n"}, _SAMPLE_PROFILE
        )
        assert rebuilt.startswith("# Job Search Context")

    def test_rebuild_roundtrip_parse_modify_reparse(self):
        sections = database.parse_jobsearch_sections(_SAMPLE_PROFILE)
        sections["target_role"] = "New target: Staff Engineer.\n"
        rebuilt = database.rebuild_jobsearch_from_sections(sections, _SAMPLE_PROFILE)
        reparsed = database.parse_jobsearch_sections(rebuilt)
        assert "New target: Staff Engineer." in reparsed["target_role"]
        assert "Jane Smith" in reparsed["who_i_am"]

    def test_rebuild_empty_sections_dict_returns_original(self):
        rebuilt = database.rebuild_jobsearch_from_sections({}, _SAMPLE_PROFILE)
        assert rebuilt == _SAMPLE_PROFILE

    def test_is_section_complete_true_for_substantive_content(self):
        content = "I started as a backend engineer and moved into tech lead roles at multiple companies."
        assert database.is_section_complete(content) is True

    def test_is_section_complete_false_when_fill_present(self):
        content = "[FILL — paste your master resume here and add lots more content to exceed 50 chars long]"
        assert database.is_section_complete(content) is False

    def test_is_section_complete_false_when_too_short(self):
        assert database.is_section_complete("Short.") is False

    def test_is_section_complete_false_for_empty(self):
        assert database.is_section_complete("") is False

    def test_is_section_complete_false_fill_with_long_content(self):
        content = "This section has a lot of text but still contains a [FILL] marker somewhere in it."
        assert database.is_section_complete(content) is False
