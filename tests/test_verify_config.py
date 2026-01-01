"""Tests for verify_config.py script."""

import json
import sys
from io import StringIO
from pathlib import Path
from unittest import mock

import scripts.verify_config as verify_config_module
from scripts.verify_config import _print_errors, main

from . import TempDirTestCase


class TestPrintErrors(TempDirTestCase):
    """Tests for _print_errors function."""

    def test_prints_scope_and_path(self) -> None:
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            _print_errors("User", Path("/home/user/.config/test.json"), ["error1"])
        output = stderr.getvalue()
        self.assertIn("User config:", output)
        self.assertIn("/home/user/.config/test.json", output)

    def test_prints_separator_line(self) -> None:
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            _print_errors("Project", Path("/test.json"), ["error1"])
        output = stderr.getvalue()
        self.assertIn("-" * 60, output)

    def test_prints_error_with_checkmark(self) -> None:
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            _print_errors("User", Path("/test.json"), ["missing field 'version'"])
        output = stderr.getvalue()
        self.assertIn("✗ missing field 'version'", output)

    def test_prints_multiple_errors(self) -> None:
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            _print_errors("User", Path("/test.json"), ["error1", "error2", "error3"])
        output = stderr.getvalue()
        self.assertIn("✗ error1", output)
        self.assertIn("✗ error2", output)
        self.assertIn("✗ error3", output)

    def test_splits_semicolon_joined_errors(self) -> None:
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            _print_errors("User", Path("/test.json"), ["error1; error2; error3"])
        output = stderr.getvalue()
        self.assertIn("✗ error1", output)
        self.assertIn("✗ error2", output)
        self.assertIn("✗ error3", output)
        self.assertNotIn("; ", output.split("✗")[1])


class TestMainNoConfigs(TempDirTestCase):
    """Tests for main() when no config files exist."""

    def setUp(self) -> None:
        super().setUp()
        self._original_cwd = Path.cwd()
        import os

        os.chdir(self.tmpdir)
        # Mock _USER_CONFIG to point to non-existent path in tmpdir
        self._user_config_path = self.tmpdir / ".cc-safety-net" / "config.json"
        self._patcher = mock.patch.object(
            verify_config_module, "_USER_CONFIG", self._user_config_path
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()
        import os

        os.chdir(self._original_cwd)
        super().tearDown()

    def test_no_configs_returns_zero(self) -> None:
        result = main()
        self.assertEqual(result, 0)

    def test_no_configs_prints_message(self) -> None:
        stdout = StringIO()
        with mock.patch.object(sys, "stdout", stdout):
            main()
        output = stdout.getvalue()
        self.assertIn("No config files found", output)
        self.assertIn("Using built-in rules only", output)


class TestMainValidConfigs(TempDirTestCase):
    """Tests for main() with valid config files."""

    def _write_user_config(self, data: dict) -> None:
        self._user_config_path.parent.mkdir(parents=True, exist_ok=True)
        self._user_config_path.write_text(json.dumps(data), encoding="utf-8")

    def _write_project_config(self, data: dict) -> None:
        path = Path(".safety-net.json")
        path.write_text(json.dumps(data), encoding="utf-8")

    def setUp(self) -> None:
        super().setUp()
        self._original_cwd = Path.cwd()
        import os

        os.chdir(self.tmpdir)
        # Mock _USER_CONFIG to point to tmpdir
        self._user_config_path = self.tmpdir / ".cc-safety-net" / "config.json"
        self._patcher = mock.patch.object(
            verify_config_module, "_USER_CONFIG", self._user_config_path
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()
        import os

        os.chdir(self._original_cwd)
        super().tearDown()

    def test_user_config_only_returns_zero(self) -> None:
        self._write_user_config({"version": 1})
        result = main()
        self.assertEqual(result, 0)

    def test_user_config_only_prints_success(self) -> None:
        self._write_user_config({"version": 1})
        stdout = StringIO()
        with mock.patch.object(sys, "stdout", stdout):
            main()
        output = stdout.getvalue()
        self.assertIn("Config OK", output)
        self.assertIn("user", output)

    def test_project_config_only_returns_zero(self) -> None:
        self._write_project_config({"version": 1})
        result = main()
        self.assertEqual(result, 0)

    def test_project_config_only_prints_success(self) -> None:
        self._write_project_config({"version": 1})
        stdout = StringIO()
        with mock.patch.object(sys, "stdout", stdout):
            main()
        output = stdout.getvalue()
        self.assertIn("Config OK", output)
        self.assertIn("project", output)

    def test_both_configs_returns_zero(self) -> None:
        self._write_user_config({"version": 1})
        self._write_project_config({"version": 1})
        result = main()
        self.assertEqual(result, 0)

    def test_both_configs_prints_both_scopes(self) -> None:
        self._write_user_config({"version": 1})
        self._write_project_config({"version": 1})
        stdout = StringIO()
        with mock.patch.object(sys, "stdout", stdout):
            main()
        output = stdout.getvalue()
        self.assertIn("Config OK", output)
        self.assertIn("user", output)
        self.assertIn("project", output)


class TestMainInvalidConfigs(TempDirTestCase):
    """Tests for main() with invalid config files."""

    def _write_user_config(self, content: str) -> None:
        self._user_config_path.parent.mkdir(parents=True, exist_ok=True)
        self._user_config_path.write_text(content, encoding="utf-8")

    def _write_project_config(self, content: str) -> None:
        path = Path(".safety-net.json")
        path.write_text(content, encoding="utf-8")

    def setUp(self) -> None:
        super().setUp()
        self._original_cwd = Path.cwd()
        import os

        os.chdir(self.tmpdir)
        # Mock _USER_CONFIG to point to tmpdir
        self._user_config_path = self.tmpdir / ".cc-safety-net" / "config.json"
        self._patcher = mock.patch.object(
            verify_config_module, "_USER_CONFIG", self._user_config_path
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()
        import os

        os.chdir(self._original_cwd)
        super().tearDown()

    def test_invalid_user_config_returns_one(self) -> None:
        self._write_user_config('{"version": 2}')
        result = main()
        self.assertEqual(result, 1)

    def test_invalid_user_config_prints_errors(self) -> None:
        self._write_user_config('{"version": 2}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("User config:", output)
        self.assertIn("unsupported version", output)

    def test_invalid_project_config_returns_one(self) -> None:
        self._write_project_config('{"rules": []}')
        result = main()
        self.assertEqual(result, 1)

    def test_invalid_project_config_prints_errors(self) -> None:
        self._write_project_config('{"rules": []}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("Project config:", output)
        self.assertIn("version", output)

    def test_both_invalid_returns_one(self) -> None:
        self._write_user_config('{"version": 2}')
        self._write_project_config('{"rules": []}')
        result = main()
        self.assertEqual(result, 1)

    def test_both_invalid_prints_both_errors(self) -> None:
        self._write_user_config('{"version": 2}')
        self._write_project_config('{"rules": []}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("User config:", output)
        self.assertIn("Project config:", output)

    def test_invalid_json_prints_error(self) -> None:
        self._write_project_config("{ not valid json }")
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("Project config:", output)
        self.assertIn("✗", output)

    def test_validation_failed_message(self) -> None:
        self._write_project_config('{"version": 2}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("Config validation failed", output)


class TestMainMixedValidity(TempDirTestCase):
    """Tests for main() with one valid and one invalid config."""

    def _write_user_config(self, content: str) -> None:
        self._user_config_path.parent.mkdir(parents=True, exist_ok=True)
        self._user_config_path.write_text(content, encoding="utf-8")

    def _write_project_config(self, content: str) -> None:
        path = Path(".safety-net.json")
        path.write_text(content, encoding="utf-8")

    def setUp(self) -> None:
        super().setUp()
        self._original_cwd = Path.cwd()
        import os

        os.chdir(self.tmpdir)
        # Mock _USER_CONFIG to point to tmpdir
        self._user_config_path = self.tmpdir / ".cc-safety-net" / "config.json"
        self._patcher = mock.patch.object(
            verify_config_module, "_USER_CONFIG", self._user_config_path
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()
        import os

        os.chdir(self._original_cwd)
        super().tearDown()

    def test_valid_user_invalid_project_returns_one(self) -> None:
        self._write_user_config('{"version": 1}')
        self._write_project_config('{"version": 2}')
        result = main()
        self.assertEqual(result, 1)

    def test_valid_user_invalid_project_prints_project_error(self) -> None:
        self._write_user_config('{"version": 1}')
        self._write_project_config('{"version": 2}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("Project config:", output)
        self.assertNotIn("User config:", output)

    def test_invalid_user_valid_project_returns_one(self) -> None:
        self._write_user_config('{"version": 2}')
        self._write_project_config('{"version": 1}')
        result = main()
        self.assertEqual(result, 1)

    def test_invalid_user_valid_project_prints_user_error(self) -> None:
        self._write_user_config('{"version": 2}')
        self._write_project_config('{"version": 1}')
        stderr = StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            main()
        output = stderr.getvalue()
        self.assertIn("User config:", output)
        self.assertNotIn("Project config:", output)
