# 변경 기록 (Changelog)

모든 프로젝트의 주목할 만한 변경 사항은 이 파일에 문서화됩니다.

이 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)을 기반으로 하며, 이 프로젝트는 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [0.1.0] - 2025-05-12

### Added

- **초기 릴리스 (Initial release of Easy Annotation)**
- HTML 파일 내에서 현재 커서 위치 또는 선택 영역의 컨텍스트(HTML, JavaScript, CSS)를 지능적으로 감지하는 기능.
- JavaScript 컨텍스트 (`<script>` 태그 내부)에서 `Ctrl+/` (macOS: `Cmd+/`) 사용 시 `//` 스타일 주석 토글 기능.
- CSS 컨텍스트 (`<style>` 태그 내부)에서 `Ctrl+/` (macOS: `Cmd+/`) 사용 시 각 라인별 `/* ... */` 스타일 주석 토글 기능.
- 그 외 HTML 컨텍스트에서 `Ctrl+/` (macOS: `Cmd+/`) 사용 시 VS Code 기본 HTML 주석 (``) 토글 기능 활용.
- TextMate 문법을 활용하여 HTML, JavaScript, CSS 언어 범위 분석 기능.
- 표준 VS Code 주석 토글 단축키 지원.
