"""Tests for safety-net git command handling."""

from .safety_net_test_base import SafetyNetTestCase


class GitCheckoutTests(SafetyNetTestCase):
    # git checkout -- (discards uncommitted changes)
    def test_git_checkout_double_dash_blocked(self) -> None:
        self._assert_blocked("git checkout -- file.txt", "git checkout --")

    def test_git_checkout_double_dash_multiple_files_blocked(self) -> None:
        self._assert_blocked("git checkout -- file1.txt file2.txt", "git checkout --")

    def test_git_checkout_double_dash_dot_blocked(self) -> None:
        self._assert_blocked("git checkout -- .", "git checkout --")

    def test_git_checkout_ref_double_dash_blocked(self) -> None:
        self._assert_blocked(
            "git checkout HEAD -- file.txt",
            "git checkout <ref> -- <path>",
        )

    # git checkout -b (create branch)
    def test_git_checkout_b_allowed(self) -> None:
        self._assert_allowed("git checkout -b new-branch")

    def test_git_checkout_orphan_allowed(self) -> None:
        self._assert_allowed("git checkout --orphan orphan-branch")

    def test_git_checkout_b_attached_value_allowed(self) -> None:
        self._assert_allowed("git checkout -bnew-branch")

    def test_git_checkout_B_attached_value_allowed(self) -> None:
        self._assert_allowed("git checkout -Bnew-branch")

    # git checkout <ref> <pathspec> (without "--")
    def test_git_checkout_ref_pathspec_blocked(self) -> None:
        self._assert_blocked(
            "git checkout HEAD file.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_ref_multiple_pathspecs_blocked(self) -> None:
        self._assert_blocked(
            "git checkout main a.txt b.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_branch_only_allowed(self) -> None:
        self._assert_allowed("git checkout main")

    def test_git_checkout_with_attached_U_value_allowed(self) -> None:
        self._assert_allowed("git checkout -U3 main")

    def test_git_checkout_previous_branch_dash_allowed(self) -> None:
        self._assert_allowed("git checkout -")

    def test_git_checkout_detach_allowed(self) -> None:
        self._assert_allowed("git checkout --detach main")

    def test_git_checkout_recurse_submodules_on_demand_allowed(self) -> None:
        self._assert_allowed("git checkout --recurse-submodules on-demand main")

    def test_git_checkout_recurse_submodules_checkout_allowed(self) -> None:
        self._assert_allowed("git checkout --recurse-submodules checkout main")

    def test_git_checkout_recurse_submodules_without_mode_allowed(self) -> None:
        self._assert_allowed("git checkout --recurse-submodules main")

    def test_git_checkout_recurse_submodules_without_mode_ref_pathspec_blocked(
        self,
    ) -> None:
        self._assert_blocked(
            "git checkout --recurse-submodules HEAD file.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_recurse_submodules_ref_pathspec_blocked(self) -> None:
        self._assert_blocked(
            "git checkout --recurse-submodules checkout HEAD file.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_track_direct_allowed(self) -> None:
        self._assert_allowed("git checkout --track direct main")

    def test_git_checkout_track_inherit_allowed(self) -> None:
        self._assert_allowed("git checkout --track inherit main")

    def test_git_checkout_track_without_mode_ref_pathspec_blocked(self) -> None:
        self._assert_blocked(
            "git checkout --track main file.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_unknown_long_option_does_not_consume_option_value_allowed(
        self,
    ) -> None:
        self._assert_allowed("git checkout --unknown -q main")

    def test_git_checkout_unknown_long_option_equals_allowed(self) -> None:
        self._assert_allowed("git checkout --unknown=1 main")

    def test_git_checkout_conflict_equals_allowed(self) -> None:
        self._assert_allowed("git checkout --conflict=merge main")

    def test_git_checkout_conflict_separate_value_allowed(self) -> None:
        self._assert_allowed("git checkout --conflict merge main")

    def test_git_checkout_unified_separate_value_allowed(self) -> None:
        self._assert_allowed("git checkout --unified 3 main")

    def test_git_checkout_unknown_long_option_consumes_value_allowed(self) -> None:
        self._assert_allowed("git checkout --unknown main file.txt")

    def test_git_checkout_q_ref_pathspec_blocked(self) -> None:
        self._assert_blocked(
            "git checkout -q main file.txt",
            "git checkout <ref> <path>",
        )

    def test_git_checkout_ref_pathspec_from_file_equals_blocked(self) -> None:
        self._assert_blocked(
            "git checkout HEAD --pathspec-from-file=paths.txt",
            "git checkout --pathspec-from-file",
        )

    def test_git_checkout_ref_pathspec_from_file_arg_blocked(self) -> None:
        self._assert_blocked(
            "git checkout HEAD --pathspec-from-file paths.txt",
            "git checkout --pathspec-from-file",
        )


class GitRestoreTests(SafetyNetTestCase):
    # git restore (discards uncommitted changes)
    def test_git_restore_file_blocked(self) -> None:
        self._assert_blocked("git restore file.txt", "git restore")

    def test_git_restore_multiple_files_blocked(self) -> None:
        self._assert_blocked("git restore a.txt b.txt", "git restore")

    def test_git_restore_worktree_blocked(self) -> None:
        self._assert_blocked(
            "git restore --worktree file.txt", "git restore --worktree"
        )

    # git restore --staged (safe, only unstages)
    def test_git_restore_staged_allowed(self) -> None:
        self._assert_allowed("git restore --staged file.txt")

    def test_git_restore_staged_dot_allowed(self) -> None:
        self._assert_allowed("git restore --staged .")

    def test_git_restore_help_allowed(self) -> None:
        self._assert_allowed("git restore --help")


class GitResetTests(SafetyNetTestCase):
    # git reset --hard
    def test_git_reset_hard_blocked(self) -> None:
        self._assert_blocked("git reset --hard", "git reset --hard")

    def test_git_reset_hard_head_blocked(self) -> None:
        self._assert_blocked("git reset --hard HEAD~1", "git reset --hard")

    def test_git_reset_hard_with_flags_blocked(self) -> None:
        self._assert_blocked("git reset -q --hard", "git reset --hard")

    def test_git_reset_hard_pipeline_bypass_blocked(self) -> None:
        self._assert_blocked("echo ok | git reset --hard", "git reset --hard")

    def test_git_reset_hard_global_options_blocked(self) -> None:
        self._assert_blocked("git -C repo reset --hard", "git reset --hard")

    def test_git_reset_hard_global_option_C_attached_blocked(self) -> None:
        self._assert_blocked("git -Crepo reset --hard", "git reset --hard")

    def test_git_reset_hard_global_option_git_dir_blocked(self) -> None:
        self._assert_blocked(
            "git --git-dir=repo/.git reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_git_dir_separate_blocked(self) -> None:
        self._assert_blocked(
            "git --git-dir repo/.git reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_work_tree_equals_blocked(self) -> None:
        self._assert_blocked(
            "git --work-tree=repo reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_work_tree_separate_blocked(self) -> None:
        self._assert_blocked(
            "git --work-tree repo reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_exec_path_separate_blocked(self) -> None:
        self._assert_blocked(
            "git --exec-path /tmp reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_no_pager_blocked(self) -> None:
        self._assert_blocked(
            "git --no-pager reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_p_no_value_blocked(self) -> None:
        self._assert_blocked(
            "git -p reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_c_attached_blocked(self) -> None:
        self._assert_blocked(
            "git -cfoo=bar reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_c_separate_blocked(self) -> None:
        self._assert_blocked(
            "git -c foo=bar reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_exec_path_equals_blocked(self) -> None:
        self._assert_blocked(
            "git --exec-path=/tmp reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_namespace_equals_blocked(self) -> None:
        self._assert_blocked(
            "git --namespace=ns reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_global_option_super_prefix_equals_blocked(self) -> None:
        self._assert_blocked(
            "git --super-prefix=/tmp reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_unknown_global_option_equals_blocked(self) -> None:
        self._assert_blocked(
            "git --unknown=1 reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_unknown_global_short_option_blocked(self) -> None:
        self._assert_blocked(
            "git -x reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_double_dash_stops_globals_blocked(self) -> None:
        self._assert_blocked(
            "git -- reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_nested_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "sudo env VAR=1 git reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_env_double_dash_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("env -- git reset --hard", "git reset --hard")

    def test_git_reset_hard_command_double_dash_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("command -- git reset --hard", "git reset --hard")

    def test_git_reset_hard_env_unset_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("env -u PATH git reset --hard", "git reset --hard")

    # git reset --merge
    def test_git_reset_merge_blocked(self) -> None:
        self._assert_blocked("git reset --merge", "git reset --merge")

    def test_git_reset_hard_sh_c_blocked(self) -> None:
        self._assert_blocked("sh -c 'git reset --hard'", "git reset --hard")


class GitCleanTests(SafetyNetTestCase):
    # git clean -f
    def test_git_clean_f_blocked(self) -> None:
        self._assert_blocked("git clean -f", "git clean")

    def test_git_clean_force_long_blocked(self) -> None:
        self._assert_blocked("git clean --force", "git clean -f")

    def test_git_clean_nf_blocked(self) -> None:
        self._assert_blocked("git clean -nf", "git clean -f")

    def test_allowlist_substring_bypass_blocked(self) -> None:
        self._assert_blocked("git clean -n && git clean -f", "git clean -f")

    def test_git_clean_fd_blocked(self) -> None:
        self._assert_blocked("git clean -fd", "git clean")

    def test_git_clean_xf_blocked(self) -> None:
        self._assert_blocked("git clean -xf", "git clean")

    # git clean dry run
    def test_git_clean_n_allowed(self) -> None:
        self._assert_allowed("git clean -n")

    def test_git_clean_dry_run_allowed(self) -> None:
        self._assert_allowed("git clean --dry-run")

    def test_git_clean_nd_allowed(self) -> None:
        self._assert_allowed("git clean -nd")


class GitPushTests(SafetyNetTestCase):
    # git push --force
    def test_git_push_force_blocked(self) -> None:
        self._assert_blocked("git push --force", "Force push")

    def test_git_push_force_origin_blocked(self) -> None:
        self._assert_blocked("git push --force origin main", "Force push")

    def test_git_push_f_blocked(self) -> None:
        self._assert_blocked("git push -f", "Force push")

    def test_git_push_f_origin_blocked(self) -> None:
        self._assert_blocked("git push -f origin main", "Force push")

    # git push --force-with-lease (safe force)
    def test_git_push_force_with_lease_allowed(self) -> None:
        self._assert_allowed("git push --force-with-lease")

    def test_git_push_force_with_lease_origin_allowed(self) -> None:
        self._assert_allowed("git push --force-with-lease origin main")

    def test_git_push_force_with_lease_attached_allowed(self) -> None:
        self._assert_allowed("git push --force-with-lease=refs/heads/main")

    def test_git_push_force_and_force_with_lease_blocked(self) -> None:
        self._assert_blocked(
            "git push --force --force-with-lease",
            "Force push",
        )

    def test_git_push_f_and_force_with_lease_blocked(self) -> None:
        self._assert_blocked(
            "git push -f --force-with-lease",
            "Force push",
        )

    def test_git_push_allowed(self) -> None:
        self._assert_allowed("git push origin main")


class GitWorktreeTests(SafetyNetTestCase):
    def test_git_worktree_remove_force_blocked(self) -> None:
        self._assert_blocked(
            "git worktree remove --force /tmp/wt",
            "git worktree remove --force",
        )

    def test_git_worktree_remove_f_blocked(self) -> None:
        self._assert_blocked(
            "git worktree remove -f /tmp/wt",
            "git worktree remove --force",
        )

    def test_git_worktree_remove_without_force_allowed(self) -> None:
        self._assert_allowed("git worktree remove /tmp/wt")

    def test_git_worktree_remove_double_dash_allows_dash_f_path(self) -> None:
        self._assert_allowed("git worktree remove -- -f")


class GitBranchTests(SafetyNetTestCase):
    # git branch -D
    def test_git_branch_D_blocked(self) -> None:
        self._assert_blocked("git branch -D feature", "git branch -D")

    def test_git_branch_D_combined_short_options_blocked(self) -> None:
        self._assert_blocked("git branch -Dv feature", "git branch -D")

    def test_git_branch_d_lowercase_allowed(self) -> None:
        self._assert_allowed("git branch -d feature")


class GitStashTests(SafetyNetTestCase):
    # git stash drop/clear
    def test_git_stash_drop_blocked(self) -> None:
        self._assert_blocked("git stash drop", "git stash drop")

    def test_git_stash_drop_index_blocked(self) -> None:
        self._assert_blocked("git stash drop stash@{0}", "git stash drop")

    def test_git_stash_clear_blocked(self) -> None:
        self._assert_blocked("git stash clear", "git stash clear")

    def test_git_stash_allowed(self) -> None:
        self._assert_allowed("git stash")

    def test_git_stash_list_allowed(self) -> None:
        self._assert_allowed("git stash list")

    def test_git_stash_pop_allowed(self) -> None:
        self._assert_allowed("git stash pop")


class SafeCommandsTests(SafetyNetTestCase):
    # Regular safe commands
    def test_git_only_allowed(self) -> None:
        self._assert_allowed("git")

    def test_git_help_allowed(self) -> None:
        self._assert_allowed("git --help")

    def test_git_status_allowed(self) -> None:
        self._assert_allowed("git status")

    def test_git_status_global_option_C_allowed(self) -> None:
        self._assert_allowed("git -C repo status")

    def test_git_status_nested_wrapper_allowed(self) -> None:
        self._assert_allowed("sudo env VAR=1 git status")

    def test_git_diff_allowed(self) -> None:
        self._assert_allowed("git diff")

    def test_git_log_allowed(self) -> None:
        self._assert_allowed("git log --oneline -10")

    def test_git_add_allowed(self) -> None:
        self._assert_allowed("git add .")

    def test_git_commit_allowed(self) -> None:
        self._assert_allowed("git commit -m 'test'")

    def test_git_pull_allowed(self) -> None:
        self._assert_allowed("git pull")

    def test_bash_c_safe_allowed(self) -> None:
        self._assert_allowed("bash -c 'echo ok'")

    def test_python_c_safe_allowed(self) -> None:
        self._assert_allowed("python -c \"print('ok')\"")

    def test_ls_allowed(self) -> None:
        self._assert_allowed("ls -la")

    def test_cat_allowed(self) -> None:
        self._assert_allowed("cat file.txt")
