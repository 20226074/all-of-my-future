# All of My Future

앞으로 공부할 연구 개념, 논문, 책을 관계로 연결해 가는 개인 지식 베이스입니다. SDE, High-dimensional PDE Solver, Diffusion, Optimal Transport 등 어느 개념도 고정된 루트가 아니며, 각 노드에서 독립적으로 학습을 확장할 수 있습니다.

사이트는 공개 GitHub 저장소와 GitHub Pages에서 운영하는 것을 전제로 합니다. 공개되어도 괜찮은 학습 기록만 저장하세요.

## 로컬 준비

1. [Quarto 설치 안내](https://quarto.org/docs/get-started/)에 따라 Quarto를 설치합니다.
2. Python 3.13을 설치합니다.
3. 프로젝트 루트에서 가상 환경과 의존성을 준비합니다.

Windows PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

macOS 또는 Linux:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

설치를 확인합니다.

```bash
quarto --version
python --version
```

## 미리보기와 빌드

개발 중 미리보기:

```bash
quarto preview
```

배포 전 전체 렌더링 확인:

```bash
quarto render
python scripts/check_site.py
```

렌더링 결과는 `_site/`에 생성되며 Git에는 커밋하지 않습니다. 링크 검사기는 생성된 모든 내부 페이지·파일·본문 fragment를 확인합니다.

## 새 개념 노드 추가

1. `templates/topic.qmd`를 복사해 `topics/<slug>/index.qmd`로 저장합니다. 예: `topics/optimal-transport/index.qmd`.
2. 복사한 문서의 YAML front matter를 채웁니다. `node-id`는 `topic-`으로 시작하는 고유값이며, 한 번 정하면 바꾸지 않는 식별자로 사용합니다. `importance`는 1–5 사이의 정수입니다. `relations`의 `target`에는 실제로 존재하는 concept 또는 entry의 `node-id`를, `type`에는 `data/relation-types.yml`에 정의된 관계 유형을 적습니다.
3. 여러 문헌이 반복해서 사용할 정의·가정·notation·기본 유도를 concept 본문에 먼저 기록합니다. 공통 표기는 `_includes/notation/`, concept 고유의 공통 유도는 `_includes/concepts/<concept>-core.qmd`에 두어 concept에서는 펼쳐서 보여주고 문헌에서는 같은 파일을 접힌 상자로 include합니다.
4. `quarto preview`로 페이지와 그래프 연결을 확인합니다.

템플릿의 필드명이 그래프 생성 스크립트가 기대하는 스키마이므로, 필드를 임의로 바꾸기보다 값을 채워 사용합니다.

## 새 항목(Entry) 추가

개념이 아닌 프로젝트 이름, 연구 질문, 주장, 메모, 아이디어는 `templates/entry.qmd`를 복사해 `entries/<slug>/index.qmd`에 둡니다. `node-id`는 `entry-`로 시작하고, `entry-kind`에는 `project`, `question`, `statement`, `note`, `idea` 중 하나를 씁니다. 그래프에서는 concept가 원, entry가 둥근 사각형으로 나타납니다.

Concept와 entry의 크기는 직접 지정한 `importance`, 연결된 concept/entry 수, 연결된 논문·책 수를 함께 반영해 자동으로 계산됩니다. 긴 이름은 도형 안에서 자동 줄바꿈되고 필요에 따라 글자 크기가 줄어듭니다.

## 새 문헌 추가

1. `templates/reference.qmd`를 복사해 `references/<slug>/index.qmd`로 저장합니다. 논문·책 한 항목당 한 디렉터리를 사용합니다.
2. YAML front matter에 `ref-`로 시작하는 고유 `node-id`, `reference-type`, 저자, 연도, `citekey`, 연결할 concept/entry의 `node-id`를 `attached-to`에 기록합니다. 그중 이 문헌이 주로 속하는 노드 하나를 `primary-node`로 지정합니다. URL 또는 DOI는 BibTeX 항목에 넣습니다.
3. `attached-to`는 이 문헌을 찾아볼 수 있는 모든 소속·연관 concept을, `primary-node`는 이 문헌의 고유 기여가 가장 직접적으로 속하는 concept을 뜻합니다. 그래프 연결과 본문 상속은 구분합니다.
4. 본문 첫머리에서 실제 전개에 사용하는 concept의 `_includes/notation/`과 `_includes/concepts/` 블록만 접힌 상자로 재사용한 뒤, **이 문헌이 공통 틀에 추가한 것**을 분리해 전개합니다. 공통 기호를 임의로 바꾸지 말고 새로운 기호·가정만 그 자리에서 정의합니다.
5. BibTeX 항목을 `bibliography/references.bib`에 추가하고, 그 키를 문서의 `citekey`와 본문 인용에 사용합니다.
6. `quarto preview`로 해당 concept/entry의 상세 패널에 문헌이 나타나는지 확인합니다.

저작권이 있는 논문 PDF나 책 파일 자체를 저장소에 올리지 말고, DOI·출판사·arXiv 등 합법적인 원문 링크를 기록합니다.

## 지식 그래프 자동 생성

`scripts/build_graph.py`는 `topics/**/index.qmd`, `entries/**/index.qmd`, `references/**/index.qmd`의 QMD front matter를 읽고 사이트에서 사용하는 `assets/generated/knowledge-graph.json`을 생성합니다. 중앙 그래프에는 concept와 entry만 그리며, 논문과 책은 연결된 노드의 상세 패널과 검색 결과에 표시합니다.

직접 다시 만들려면 프로젝트 루트에서 실행합니다.

```bash
python scripts/build_graph.py
```

Quarto 설정의 `project.pre-render`에도 같은 명령이 연결되어 있으므로 `quarto preview`, `quarto render`, GitHub Actions 배포 때 그래프가 자동으로 갱신됩니다. 생성 오류가 나면 중복된 ID, 존재하지 않는 연결 ID, 템플릿에서 빠진 필드를 먼저 확인합니다.

왼쪽 탐색기의 concept/entry 순서는 드래그하거나 이동 핸들에서 `Alt+↑/↓`를 눌러 바꿀 수 있습니다. 그래프 노드를 드래그하면 위치가 고정되고, 오른쪽 **배치 편집**에서는 중요도를 바꿀 수 있습니다. 순서·위치·중요도는 같은 사이트 주소의 현재 브라우저에 자동 저장되므로 브라우저나 컴퓨터를 다시 시작해도 유지됩니다. 단, `127.0.0.1` 미리보기와 GitHub Pages는 서로 다른 주소이므로 저장값을 공유하지 않습니다.

다른 기기로 옮기려면 왼쪽의 **배치 내보내기**로 `graph-view.json`을 받은 뒤 새 기기에서 **가져오기**를 사용합니다. 이 배치를 사이트의 공통 기본값으로 만들려면 내보낸 파일을 `data/graph-view.json`으로 교체하고 commit/push합니다. GitHub Pages는 정적 사이트이므로 공개 브라우저에서 저장소에 안전하게 직접 쓰지는 않습니다.

## GitHub Pages 배포

이 저장소는 이미 [공개 사이트](https://20226074.github.io/all-of-my-future/)와 연결되어 있습니다. `_quarto.yml`의 `site-url`, Git remote, `gh-pages` 브랜치 게시가 구성되어 있으며 별도의 `_publish.yml`은 사용하지 않습니다.

변경을 공개하려면 `main` 브랜치에 commit한 뒤 push합니다.

```bash
git add .
git commit -m "Describe the update"
git push origin main
```

`.github/workflows/publish.yml`의 **Quarto Publish** workflow가 그래프 생성과 전체 render를 실행한 뒤 결과를 `gh-pages`에 게시합니다. 진행 상태는 GitHub 저장소의 Actions 탭에서 확인할 수 있습니다. 배포가 성공했는데 예전 화면이 보이면 브라우저를 새로고침하거나 잠시 뒤 다시 확인합니다.

## 공개 저장소의 개인정보 주의

- API 키, 비밀번호, 토큰, `.env` 내용은 절대 커밋하지 않습니다.
- 실명·연락처·일정·주소·개인 계정 식별자와 비공개 연구 자료는 공개 전에 제거합니다.
- 로컬 절대 경로나 개인 OneDrive 경로를 문서와 출력 로그에 남기지 않습니다.
- Git에서 파일을 나중에 삭제해도 과거 커밋에는 남을 수 있습니다. 커밋 전에 `git diff --staged`로 공개될 내용을 확인합니다.
- GitHub Pages 사이트는 인터넷에 공개됩니다. 저장소 공개 여부와 별개로, 게시된 페이지에 민감한 내용을 넣지 않습니다.

배포 방식의 기준 문서는 [Quarto의 GitHub Pages 안내](https://quarto.org/docs/publishing/github-pages.html)입니다.
