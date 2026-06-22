import hashlib

import database


def get_prompt(
    prompt_key: str,
    context: dict,
    job_id: int | None = None,
    source: str = "direct",
) -> dict:
    """
    Fetch active prompt for key, assemble with context, write a prompt_usage row.

    Returns {"prompt_text": str, "prompt_usage_id": int}.
    Raises ValueError if no active prompt exists for the key.
    """
    row = database.get_active_prompt(prompt_key)
    if row is None:
        raise ValueError(f"No active prompt found for key '{prompt_key}'")

    raw_text = database.assemble_prompt(row["segments_text"])
    prompt_text = raw_text
    for key, val in context.items():
        prompt_text = prompt_text.replace(f"{{{key}}}", str(val))
    prompt_hash = hashlib.sha256(prompt_text.encode()).hexdigest()

    prompt_usage_id = database.create_prompt_usage(
        prompt_key=prompt_key,
        prompt_version=row["version"],
        prompt_text=prompt_text,
        prompt_hash=prompt_hash,
        source=source,
        job_id=job_id,
    )

    return {
        "prompt_text": prompt_text,
        "prompt_usage_id": prompt_usage_id,
        "temperature": row.get("temperature", 0.0),
    }
