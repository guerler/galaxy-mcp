# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### What a caller sees differently

This server is still evolving and promises no stable contract yet; this lists where an answer or
an accepted argument changed, so a caller can adjust.

- `get_history_contents` rows no longer carry `dataset_id`. It is the id of the Dataset beneath
  each history item, which no tool takes; offered beside `id`, it invites being used as one, and
  as an input it resolves to an unrelated dataset rather than failing. Use `id`.
- `get_history_contents` rows are the contents index's summary view. Dataset rows carry the same
  keys as before; collection rows gain `type_id` and `store_times_summary` and no longer carry
  `model_class`, `populated` or `column_definitions`.
- `get_history_contents` takes `order` as a sort key with its direction spelled out (`hid-asc`,
  `name-dsc`, ...) and refuses a bare key, which used to be read as ascending, or an unknown one.
- A `get_history_contents` failure quotes the contents URL with its query, the request now going
  out through requests rather than bioblend.
- A `get_history_contents` page can hold fewer than `limit` items when it would exceed the output
  budget; its `pagination` says so and names the offset to continue from.
- `update_page` answers with the page's new `content_hash`. It refuses content whose directives
  name an object by something that is not an encoded id, whole-page writes included, and a
  section edit on a page authored as HTML.
- `get_invocations` given an invocation id makes one more request, for its jobs summary. Listings
  make none.

### Added

- `update_page` takes `section_heading`/`section_content` to replace a section of a markdown page,
  with Galaxy's own section rules (every section with that heading line is replaced), and
  `expect_hash` to refuse a write when the page changed since it was read.
  Directive ids that are not encoded ids are refused before anything is sent. The answer carries
  the new `content_hash`. The TypeScript surface answers the same.
- `get_page` returns `content_hash`, Galaxy's page hash of the editable source (djb2 over code
  points, as `lib/galaxy/agents/page_assistant.py` computes it), so a caller can tell on a later
  read whether the page changed. The TypeScript surface answers the same.

### Changed

- `get_history_contents` asks Galaxy for one filtered, sorted window with its matching count
  (the contents index's stats media type) instead of fetching the whole history and paging it
  here; rows are the index's summary view. `order` is a sort key Galaxy takes for one history
  (`hid`, `create_time`, `update_time`, `name`, `extension`, `size`) with `-asc` or `-dsc`;
  anything else is refused. A page over the output budget is cut and continues from the first
  item it did not return. Rows no longer carry `dataset_id`. The TypeScript surface answers the
  same.
- `get_invocations` given an invocation id also reads its jobs summary (one more request) and
  adds `job_states` and `outcome` -- failing, failed, cancelled, completed, or Galaxy's own
  state -- because Galaxy's `state` describes scheduling only and says completed for a run whose
  jobs failed. A failure with only paused jobs behind it is failed, since Galaxy pauses the jobs
  downstream of a failed one; a summary that cannot be read adds neither field. A listing is
  unchanged. The TypeScript surface answers the same.
- `get_job_details` reads the job with `full=true`, so a failed job's logs come back; each log
  longer than 4 KB keeps its first and last 2 KB on line boundaries, with a line saying how much
  was left out. The TypeScript surface answers the same.

### Fixed

- The three raw requests over the unprivileged-tools API now check the status Galaxy answered
  with, as every other raw request in the server already did. `delete_user_tool` reported
  `deactivated: true` for a DELETE that 404'd or 403'd, `list_user_tools` sliced an error body
  as a page and reported the result as `List user tools failed: slice(0, 25, None)`, and
  `run_user_tool` read one as a tool record and answered "No user-defined tool found with
  UUID ...". All three now fail with the sentence `format_error` builds for a refused request.
- `get_invocations(invocation_id=..., step_details=True)` now sends `step_details` to Galaxy.
  The single-invocation path went through bioblend's `show_invocation`, which has no such
  parameter, so the flag was dropped and Galaxy answered with every step's `jobs` list empty --
  an invocation still running looked like one with nothing left to do. Without `step_details`
  the request is unchanged.

## [1.4.0] - 2026-04-22

### Added

- User-defined tool support: `create_user_tool`, `list_user_tools`, `delete_user_tool`, and `run_user_tool` for managing and executing unprivileged tools (PR #40)
- Galaxy tool credentials integration -- auto-discover and supply user credentials when running tools (PRs #41, #44)
- `User-Agent` header on all GalaxyInstance requests (`galaxy-mcp/{version} bioblend/{version}`) so Galaxy can identify agent traffic

### Changed

- Shared `GalaxyInstance` is now thread-safe, enabling concurrent MCP calls (PR #38)
- Upgraded to fastmcp >=3.0.0; IWC functions and integration tests updated for the new API (PR #35)
- Added upper-bound version pins to all production dependencies (PR #36)

### Fixed

- IWC workflow functions no longer break under fastmcp >= 3.0.0

## [1.3.0] - 2026-01-28

### Added

- `recommend_iwc_workflows` MCP tool for semantic search of IWC workflows using BM25 ranking
- `get_iwc_workflow_details` MCP tool for comprehensive workflow info before importing
- `GalaxyResult` and `PaginationInfo` structured response models for consistent API responses
- Browser-based OAuth authentication for Galaxy instances (PR #18)
- Dataset collection support with robust collection detection (PR #26)
- Real integration tests against live Galaxy instances

### Changed

- Enriched `search_iwc_workflows` with additional metadata (readme_summary, step_count, authors, categories, tools_used)
- Improved tool search to support substring matching in name, ID, and description (PR #27)
- Added `rank-bm25` dependency for semantic workflow search

## [1.2.0] - 2025-12-19

### Added

- `search_tools` MCP tool for searching Galaxy tools by name or keyword

### Changed

- Fixed release workflow to checkout correct tag during deployment

## [1.1.0] - 2025-06-23

### Fixed

- `download_dataset` now handles read-only filesystem environments gracefully by downloading to memory when no file path is specified
- Fixed Makefile `make dev` command to work with current uv version by removing unsupported `--from` flag

### Improved

- Enhanced `download_dataset` documentation with explicit LLM guidance for filesystem access requirements
- Added clear messaging about memory vs. filesystem download modes with suggested filename support
- Updated function signature to provide better error handling and user feedback

## [1.0.0] - 2025-06-22

### Added

- `get_dataset_details` MCP tool for comprehensive dataset metadata with optional content preview
- `download_dataset` MCP tool to download datasets to local filesystem with flexible naming options
- Binary file support in dataset content preview with hexadecimal display
- Enhanced parameter documentation with detailed Galaxy ID format examples and comprehensive descriptions

### Changed

- **BREAKING**: `get_job_details` now accepts `dataset_id` instead of `job_id` as primary parameter, using dataset provenance to find creating job
- Upgraded from FastMCP 1.0 to FastMCP2 with remote deployment support via SSE transport
- Simplified parameter validation by removing complex JSON string parsing across all functions
- Improved API consistency with plain string-only identifier parameters
- Consolidated dependency management to use uv with lock file
- Enhanced test coverage for job operations and dataset functionality

### Fixed

- Job lookup now works with the more commonly available dataset IDs instead of job IDs
- Fallback mechanism for job details when provenance data is unavailable
- Better error handling for dataset state validation in download operations

## [0.2.1] - 2025-06-11

### Added

- `filter_tools_by_dataset` MCP tool to recommend Galaxy tools based on dataset types/keywords
- Comprehensive test suite for the new filtering functionality

### Changed

- Improved error handling consistency across all MCP tools

## [0.2.0] - 2025-05-21

### Added

- `get_server_info` MCP tool to retrieve comprehensive Galaxy server information including version, URL, and configuration details

## [0.1.0] - 2025-01-16

### Added

- Initial release of galaxy-mcp
- MCP server implementation for Galaxy bioinformatics platform
- Connection and authentication with Galaxy instances
- History management (create, list, get details)
- Tool operations (search, run)
- Dataset operations (upload, download)
- Workflow operations (import from IWC, list invocations)
- Comprehensive test suite
- Command-line interface via `galaxy-mcp` command
- Environment variable support for configuration
