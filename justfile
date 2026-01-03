# Install dependencies
setup:
    uv sync
    uv run pre-commit install

# Run linter, type checker, dead code detection, and tests
check:
    # Run linter
    uv run ruff check --fix
    # Run type checker
    uv run mypy .
    # Run dead code detection
    uv run vulture
    # Run tests with coverage report
    uv run pytest --cov=scripts --cov-report=json --cov-report=term-missing

# Bump version and generate changelog
bump:
    @test "$(git branch --show-current)" = "main" || (echo "Error: Must be on main branch to release" && exit 1)
    uv run cz bump --no-verify
    @# Capture tag immediately after cz bump (before amend orphans it)
    @TAG=$$(git describe --tags --abbrev=0) && \
        uv sync && \
        git add uv.lock && \
        git commit --amend --no-edit --no-verify && \
        git tag -f $$TAG && \
        git push -u origin HEAD --follow-tags && \
        gh release create $$TAG --notes "$$(uv run cz changelog $$TAG --dry-run)"
