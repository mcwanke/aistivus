import math
import re


def compute_line_count(content: str) -> dict:
    """
    Estimate visual line count of a Typst resume.

    Only body-font content counts: prose paragraphs, bullet list items, and
    competency grid items. Header-font content (#section, #job, #subjob,
    #align header block, education grid) is skipped. Comments are skipped.

    Formula per DESIGN_p2.5.md:
      bullets:      word-wrap simulation at 97 chars per line
      prose:        word-wrap simulation at 100 chars per line
      competencies: ceil(item_count / 2) for the whole grid

    Returns a dict with total, per-type subtotals, and a detail list for
    debugging/validation.
    """
    lines = content.split("\n")
    bullets_lines = 0
    prose_lines = 0
    competency_lines = 0
    detail = []

    last_section = ""
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i].strip()

        # Skip blank lines and comment lines
        if not line or line.startswith("//"):
            i += 1
            continue

        # Skip lines that are just structural bracket/paren noise
        if line in ("{", "}", "(", ")", "[", "]", ","):
            i += 1
            continue

        # ── Preamble / template directives (skip, consuming multi-line blocks) ──

        if (
            line.startswith("#let ")
            or line.startswith("#set ")
            or line.startswith("#show ")
        ):
            i = _skip_block(lines, i)
            continue

        # ── Structural/header-font calls (skip) ──

        if line.startswith("#section("):
            m = re.search(r'#section\("([^"]+)"\)', line)
            if m:
                last_section = m.group(1).upper()
            i = _skip_block(lines, i)
            continue

        if (
            line.startswith("#job(")
            or line.startswith("#subjob[")
            or line.startswith("#align(")
        ):
            i = _skip_block(lines, i)
            continue

        # Spacing helpers — single line, no block
        if line.startswith("#v(") or line.startswith("#h("):
            i += 1
            continue

        # ── #list(...) → bullet items ──

        if line.startswith("#list("):
            block, i = _collect_block(lines, i)
            items = _extract_bracket_items(block)
            for item_text in items:
                text = item_text.strip()
                if len(text) < 3:
                    continue  # skip single-char markers like [▸]
                count = _count_wrapped_lines(text, 97)
                bullets_lines += count
                detail.append({"type": "bullet", "chars": len(text), "lines": count})
            continue

        # ── #grid(...) → competency grid or education (skip) ──

        if line.startswith("#grid("):
            block, i = _collect_block(lines, i)
            if last_section == "CORE COMPETENCIES":
                items = _extract_bracket_items(block)
                item_count = sum(1 for t in items if len(t.strip()) > 3)
                count = math.ceil(item_count / 2)
                competency_lines += count
                detail.append(
                    {"type": "competencies", "items": item_count, "lines": count}
                )
            # else: education or other structural grid — skip
            continue

        # ── `- ` bullet lines ──

        if line.startswith("- "):
            text = line[2:].strip()
            if text:
                count = _count_wrapped_lines(text, 97)
                bullets_lines += count
                detail.append({"type": "bullet", "chars": len(text), "lines": count})
            i += 1
            continue

        # ── Prose: any remaining non-empty, non-directive line ──

        if not line.startswith("#") and line not in (")", "]", "}"):
            count = _count_wrapped_lines(line, 100)
            prose_lines += count
            detail.append({"type": "prose", "chars": len(line), "lines": count})

        i += 1

    total = bullets_lines + prose_lines + competency_lines
    return {
        "total": total,
        "bullets": bullets_lines,
        "prose": prose_lines,
        "competencies": competency_lines,
        "detail": detail,
    }


def _count_wrapped_lines(text: str, width: int) -> int:
    """
    Simulate word-wrap at `width` characters and return the line count.
    Walks backwards from the width boundary to the nearest space to find
    the break point, then recurses on the remainder.
    """
    text = text.strip()
    if not text:
        return 0
    if len(text) <= width:
        return 1
    break_at = width
    while break_at > 0 and text[break_at] != " ":
        break_at -= 1
    if break_at == 0:
        break_at = width  # no space found — force break at width
    return 1 + _count_wrapped_lines(text[break_at:], width)


def _skip_block(lines: list[str], i: int) -> int:
    """
    Consume lines starting at i until the paren+bracket depth returns to 0.
    Returns the index of the first line after the block.
    """
    line = lines[i].strip()
    depth = line.count("(") + line.count("[") - line.count(")") - line.count("]")
    depth += line.count("{") - line.count("}")
    i += 1
    while i < len(lines) and depth > 0:
        l = lines[i].strip()
        depth += l.count("(") + l.count("[") + l.count("{")
        depth -= l.count(")") + l.count("]") + l.count("}")
        i += 1
    return i


def _collect_block(lines: list[str], i: int) -> tuple[str, int]:
    """
    Collect a multi-line block starting at i, tracking paren+bracket depth.
    Returns (block_text, next_i).
    """
    collected = [lines[i].strip()]
    line = lines[i].strip()
    depth = line.count("(") + line.count("[") - line.count(")") - line.count("]")
    depth += line.count("{") - line.count("}")
    i += 1
    while i < len(lines) and depth > 0:
        l = lines[i].strip()
        collected.append(l)
        depth += l.count("(") + l.count("[") + l.count("{")
        depth -= l.count(")") + l.count("]") + l.count("}")
        i += 1
    return "\n".join(collected), i


def _extract_bracket_items(text: str) -> list[str]:
    """
    Extract all top-level [content] items from a Typst block string.
    Handles nested brackets inside item content correctly.
    """
    items = []
    depth = 0
    current: list[str] = []
    in_item = False

    for ch in text:
        if ch == "[":
            if depth == 0:
                in_item = True
                current = []
            else:
                current.append(ch)
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0 and in_item:
                items.append("".join(current))
                in_item = False
                current = []
            elif depth > 0:
                current.append(ch)
        elif in_item:
            current.append(ch)

    return items
