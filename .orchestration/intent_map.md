# Intent Map

This file maps high-level business intents to physical files and AST nodes.

## JWT Authentication Migration (INT-001)

- **Files**: src/auth/\*\*, src/middleware/jwt.ts
- **Scope**: Authentication system refactoring
- **Constraints**: No external auth providers, maintain backward compatibility

## Setup Python Project (INT-001)

- **Files**: pyproject.toml, README.md, src/chimera/\*\*, requirements.txt, tests/\*\*, specs/\*\*, Makefile, Dockerfile, scripts/spec_check.py
- **Scope**: Complete Python project structure setup
- **Constraints**: Must align with standard Python project structure
- **Acceptance Criteria**: Project structure follows best practices (e.g., src/, tests/, README.md)

## Implement Create Sort String Array Util Function (INT-002)

- **Files**: src/chimera/utils.py, tests/test_utils.py
- **Scope**: Utility functions in src/utils\*
- **Constraints**: Must not use external libraries for sorting
- **Acceptance Criteria**: Function correctly sorts an array of strings in ascending order

## Implement Axios Instance for API Calls (INT-003)

- **Files**: src/chimera/\_\_init\_\_.py, src/chimera/utils.py, src/chimera/skills.py, src/chimera/cli.py, pyproject.toml
- **Scope**: Utility functions in src/utils\*
- **Constraints**: Must use axios for this instance creation
- **Acceptance Criteria**: axios instance is created with default configuration for API calls
