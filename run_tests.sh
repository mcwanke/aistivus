#!/usr/bin/env bash
# Usage:
#   ./run_tests.sh            quick run — compact failure output
#   ./run_tests.sh --verbose  deep run — full tracebacks + verbose vitest output

RESULTS_FILE="ignore/test_results.txt"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERBOSE=0
[[ "$1" == "--verbose" ]] && VERBOSE=1

BACKEND_STATUS=""
FRONTEND_STATUS=""
HAS_FAILURES=0
RESULTS_CONTENT=""

run_backend() {
    if [[ $VERBOSE -eq 1 ]]; then
        TB_FLAG="--tb=long"
        EXTRA_FLAGS="-v"
    else
        TB_FLAG="--tb=short"
        EXTRA_FLAGS="-q"
    fi

    OUTPUT=$(cd "$SCRIPT_DIR" && .venv/bin/python3 -m pytest $EXTRA_FLAGS $TB_FLAG 2>&1)
    EXIT_CODE=$?

    SUMMARY_LINE=$(echo "$OUTPUT" | grep -E "^(FAILED|ERROR|[0-9]+ passed)" | tail -1)
    [[ -z "$SUMMARY_LINE" ]] && SUMMARY_LINE=$(echo "$OUTPUT" | tail -3 | grep -E "passed|failed|error" | tail -1)

    if [[ $EXIT_CODE -eq 0 ]]; then
        PASSED=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ passed" | head -1)
        BACKEND_STATUS="✓ Backend: ${PASSED:-passed}"
    else
        FAILED=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ failed" | head -1)
        BACKEND_STATUS="✗ Backend: ${FAILED:-FAILED}"
        HAS_FAILURES=1
        RESULTS_CONTENT+="=== BACKEND FAILURES ===\n${OUTPUT}\n\n"
    fi
}

run_frontend() {
    if [[ $VERBOSE -eq 1 ]]; then
        REPORTER_FLAG="--reporter=verbose"
    else
        REPORTER_FLAG="--reporter=default"
    fi

    OUTPUT=$(cd "$SCRIPT_DIR/frontend" && npm run test -- --run $REPORTER_FLAG 2>&1)
    EXIT_CODE=$?

    SUMMARY_LINE=$(echo "$OUTPUT" | grep -E "[0-9]+ passed" | tail -1)

    if [[ $EXIT_CODE -eq 0 ]]; then
        PASSED=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ passed" | head -1)
        FRONTEND_STATUS="✓ Frontend: ${PASSED:-passed}"
    else
        FAILED=$(echo "$SUMMARY_LINE" | grep -oE "[0-9]+ failed" | head -1)
        FRONTEND_STATUS="✗ Frontend: ${FAILED:-FAILED}"
        HAS_FAILURES=1
        RESULTS_CONTENT+="=== FRONTEND FAILURES ===\n${OUTPUT}\n\n"
    fi
}

run_backend
run_frontend

TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
MODE=$([[ $VERBOSE -eq 1 ]] && echo "verbose" || echo "quick")
SUMMARY="${BACKEND_STATUS} | ${FRONTEND_STATUS}"

echo ""
echo "[$TIMESTAMP] ($MODE)"
echo "$SUMMARY"

{
    echo "[$TIMESTAMP] ($MODE)"
    echo "$SUMMARY"
    if [[ $HAS_FAILURES -eq 1 ]]; then
        echo ""
        echo -e "$RESULTS_CONTENT"
    fi
} > "$SCRIPT_DIR/$RESULTS_FILE"
if [[ $HAS_FAILURES -eq 1 ]]; then
    echo "Failure details written to $RESULTS_FILE"
fi
