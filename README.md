# Trickcal Liquid Glass Wallpaper

트릭컬 캐릭터 이미지를 입체적인 유리 오브젝트로 배치하는 Windows용 Lively Wallpaper입니다. 오브젝트는 마우스 위치에 따라 기울어지고 반사광이 변하며, 원하는 위치로 직접 이동할 수 있습니다.

배경화면 본체, 관리 컨트롤러, 이미지 라이브러리가 서로 분리되어 있습니다. 새로운 이미지를 추가할 때 배경화면을 다시 설치할 필요가 없습니다.

## 먼저 준비할 것

이 프로젝트는 Windows에서 사용합니다. 설치 전에 다음 프로그램을 준비해 주세요.

1. [Lively Wallpaper](https://www.rocksdanister.com/lively/)
2. [Node.js LTS](https://nodejs.org/en/download)
3. Google Chrome 또는 Microsoft Edge

Node.js 다운로드 페이지에서는 **Current가 아닌 LTS**와 Windows용 **Installer(.msi)**를 선택하세요. 일반적인 Intel·AMD Windows PC는 `x64`, Windows ARM 기기는 `ARM64`를 선택합니다. 설치 옵션은 기본값으로 진행하면 됩니다.

설치 확인이 필요하면 새 PowerShell 또는 명령 프롬프트를 열고 다음 명령어를 입력하세요.

```powershell
node -v
npm -v
```

두 명령어 모두 버전 번호를 표시하면 준비가 끝난 것입니다. 컨트롤러를 사용할 때 Node.js 창을 별도로 열어둘 필요는 없습니다.

## 다운로드할 파일

[최신 GitHub Release](https://github.com/beanjean1234/trickcal_wallpaper/releases/latest)에서 다음 파일을 내려받습니다.

| 파일 | 용도 | 필요 여부 |
|---|---|---|
| `liquid-glass-icons-lively.zip` | Lively 배경화면 본체 | 필수 |
| `trickcal-wallpaper-controller.zip` | 오브젝트 관리창, 이미지 제공, 배치 저장 | 필수 |
| `trickcal-wallpaper-images.zip` | 바로 사용할 수 있는 캐릭터 이미지 모음 | 권장 |

세 ZIP의 용도가 다르므로 파일 이름이 비슷해도 서로 바꾸어 사용하면 안 됩니다.

## 처음 설치하기

### 1. 컨트롤러 설치

1. `trickcal-wallpaper-controller.zip`을 원하는 일반 폴더에 완전히 압축 해제합니다.
2. 압축을 푼 폴더에서 `Install-Controller.cmd`를 실행합니다.
3. 다음과 같은 설치 완료 메시지가 표시되는지 확인합니다.

```text
Trickcal Wallpaper Controller installed: ...
Auto start: True
```

압축 해제 위치는 바탕화면, 다운로드, 문서 폴더 등 어디든 괜찮습니다. 나중에 제거할 때 `Uninstall-Controller.cmd`를 사용할 수 있도록 압축 해제 폴더를 보관하는 것을 권장합니다.

컨트롤러는 현재 Windows 사용자 계정의 다음 위치에 설치되고 로그인할 때 자동으로 시작됩니다.

```text
%LOCALAPPDATA%\TrickcalWallpaper\Controller
```

### 2. Lively에 배경화면 추가

1. Lively Wallpaper를 실행합니다.
2. `liquid-glass-icons-lively.zip`을 Lively 창으로 드래그합니다.
3. 추가된 **Liquid Glass Icons** 배경화면을 선택해 적용합니다.

이 ZIP은 Lively에 직접 추가하는 파일이므로 미리 압축 해제할 필요가 없습니다.

처음 실행한 배경화면에 오브젝트가 하나도 없는 것은 정상입니다. 다음 단계에서 원하는 이미지를 선택하면 오브젝트가 생성됩니다.

### 3. 오브젝트 관리창 열기

1. Lively에서 적용된 **Liquid Glass Icons** 배경화면의 설정을 엽니다.
2. **오브젝트 관리 및 배치** 항목의 **브라우저에서 열기** 버튼을 누릅니다.
3. 별도의 오브젝트 관리창이 열리는지 확인합니다.

관리창은 Google Chrome이 설치되어 있으면 Chrome으로 열리고, Chrome이 없으면 Microsoft Edge로 열립니다. 일반 브라우저 프로필과 분리된 전용 프로필을 사용하므로 기존 로그인이나 브라우저 설정에는 영향을 주지 않습니다.

### 4. 이미지 팩 가져오기

1. 관리창에서 **팩 가져오기**를 누릅니다.
2. 내려받은 `trickcal-wallpaper-images.zip`을 선택합니다.
3. 이미지 목록과 분류 폴더가 나타날 때까지 기다립니다.

이미지 팩 ZIP은 직접 압축 해제하지 않고 관리창에서 그대로 선택합니다.

### 5. 오브젝트 추가하고 배치하기

1. 상단의 분류 폴더 또는 이미지 이름 검색으로 원하는 이미지를 찾습니다.
2. 이미지 오른쪽 위의 체크박스를 선택하면 해당 오브젝트가 생성됩니다.
3. 체크를 해제하면 해당 오브젝트가 제거됩니다.
4. 생성된 오브젝트를 마우스로 드래그해 원하는 위치로 옮깁니다.
5. 작업을 마치면 **배치 저장**을 누릅니다.

저장된 오브젝트는 다음에 Windows나 Lively를 다시 실행해도 같은 위치에 표시됩니다. 배경화면에서도 오브젝트를 직접 드래그해 위치를 조정할 수 있습니다.

### 격자와 그룹으로 배치하기

1. 관리창의 **배치 도구**에서 **한 줄 개수**를 정합니다.
2. **격자 적용**을 누르면 현재 오브젝트가 선택한 열 수에 맞춰 정렬됩니다.
3. 자동으로 표시되는 흰색 그룹 프레임 안쪽을 드래그하면 모든 오브젝트가 함께 이동합니다.
4. 프레임 오른쪽 위의 빗금 손잡이를 드래그하면 오브젝트 크기는 유지되고 가로·세로 간격만 변합니다.
5. 상단의 **자유 배치**를 누르면 그룹 조작을 끝내고 개별 오브젝트 드래그로 돌아갑니다.

그룹 프레임은 관리창에서만 보이며 실제 배경화면에는 표시되지 않습니다. 프레임이 이미지 선택창과 겹치면 손잡이를 가리지 않도록 이미지 선택창이 일시적으로 사라집니다.

### 개인 이미지 또는 GIF를 배경으로 사용하기

1. 관리창의 **배경** 항목을 펼칩니다.
2. PC에 있는 파일은 **이미지·GIF 선택**으로 불러옵니다. GIF, JPG, PNG, WebP를 지원합니다.
3. 인터넷 이미지는 이미지 또는 GIF의 직접 URL을 입력하고 **적용**을 누릅니다.
4. **회색 오버레이** 슬라이더로 배경을 어둡게 만드는 정도를 조절합니다.
5. 배경과 오브젝트 배치를 함께 확정하려면 **배치 저장**을 누릅니다.

**기본 배경**을 누르면 기존 WebGL 배경으로 돌아갑니다. URL 배경은 배경화면을 표시할 때 해당 주소에 연결할 수 있어야 하며, 주소의 파일이 삭제되거나 접근이 차단되면 표시되지 않습니다.

## Lively에서 조절할 수 있는 값

배경화면 설정에서 다음 효과를 조절할 수 있습니다.

- Specular highlight: 앞면 스페큘러 하이라이트 강도
- Specular angle: 스페큘러 하이라이트 방향
- Shadow opacity: 오브젝트 그림자 불투명도
- Shadow blur: 오브젝트 그림자 흐림 정도

## 내 이미지 추가하기

관리창에서 **폴더 열기**를 누르면 이미지 라이브러리가 열립니다.

```text
%LOCALAPPDATA%\TrickcalWallpaper\Library
├─ 요정\
├─ 용족\
├─ 유령\
└─ 원하는 새 분류\
```

1. 라이브러리 아래에 원하는 분류 폴더를 만듭니다.
2. WebP, PNG, JPG 또는 JPEG 이미지를 넣습니다.
3. 관리창에서 **새로고침**을 누릅니다.

새 분류 폴더는 자동으로 발견됩니다. 이미지나 분류를 추가하기 위해 배경화면, 컨트롤러 또는 이미지 팩을 다시 설치할 필요가 없습니다.

## 저장되는 사용자 데이터

사용자 데이터는 컨트롤러 프로그램과 분리되어 다음 위치에 저장됩니다.

```text
%LOCALAPPDATA%\TrickcalWallpaper\layout.json   # 오브젝트 목록과 위치
%LOCALAPPDATA%\TrickcalWallpaper\Library\     # 사용자 이미지 라이브러리
%LOCALAPPDATA%\TrickcalWallpaper\Background\  # 직접 선택한 배경 이미지 또는 GIF
```

컨트롤러를 업데이트하거나 기본 방식으로 제거해도 이 사용자 데이터는 보존됩니다.

배치를 백업하려면 `layout.json`을 다른 위치에 복사하면 됩니다. 새 사용자처럼 빈 배치로 시작하려면 컨트롤러와 관리창을 닫은 뒤 파일 이름을 다음처럼 변경할 수 있습니다.

```text
layout.json → layout.backup.json
```

백업을 복원할 때만 이름을 다시 `layout.json`으로 바꾸면 됩니다.

## 업데이트하기

새 Release가 나오면 변경된 파일을 다시 내려받습니다.

### 컨트롤러 업데이트

1. 새 `trickcal-wallpaper-controller.zip`을 별도 폴더에 압축 해제합니다.
2. 새 폴더의 `Install-Controller.cmd`를 실행합니다.

기존 컨트롤러를 먼저 제거할 필요가 없습니다. 설치 프로그램이 실행 중인 이전 컨트롤러를 종료하고 같은 위치의 프로그램 파일을 교체합니다. 저장된 배치와 이미지 라이브러리는 유지됩니다.

### 배경화면 업데이트

Release에 새 `liquid-glass-icons-lively.zip`이 포함되어 있으면 Lively에 다시 추가해 적용합니다. 설정 표시가 이전 상태로 남아 있다면 Lively 설정에서 **기본값 복원**을 한 번 실행하세요.

### 이미지 팩 업데이트

새로운 이미지가 필요할 때만 새 `trickcal-wallpaper-images.zip`을 관리창의 **팩 가져오기**로 다시 가져옵니다. 사용자가 직접 추가한 다른 경로의 이미지는 그대로 유지됩니다.

## 문제 해결

### `node`를 찾을 수 없다고 나오는 경우

- Node.js **LTS**를 설치했는지 확인합니다.
- 설치 후 열려 있던 PowerShell과 명령 프롬프트를 모두 닫았다가 다시 엽니다.
- `node -v`가 계속 실패하면 Windows를 재시작한 뒤 컨트롤러 설치를 다시 실행합니다.

### 관리창이 열리지 않는 경우

1. 최신 `trickcal-wallpaper-controller.zip`을 사용했는지 확인합니다.
2. 압축을 푼 상태에서 `Install-Controller.cmd`를 다시 실행합니다.
3. Google Chrome 또는 Microsoft Edge가 설치되어 있는지 확인합니다.
4. Lively 설정에서 **브라우저에서 열기**를 다시 누릅니다.

### 관리창에 이미지가 없는 경우

- `trickcal-wallpaper-images.zip`을 **팩 가져오기**로 선택했는지 확인합니다.
- **폴더 열기**로 라이브러리 파일을 확인한 뒤 **새로고침**을 누릅니다.

### 이전에 배치한 오브젝트가 다시 나타나는 경우

컨트롤러를 재설치해도 `layout.json`은 의도적으로 보존됩니다. 관리창에서 해당 이미지의 체크를 해제하고 **배치 저장**을 누르거나, 위의 백업 방법으로 `layout.json`의 이름을 변경하세요.

### Lively 버튼에 `true`가 표시되는 경우

최신 `liquid-glass-icons-lively.zip`을 다시 적용하고 Lively 설정에서 **기본값 복원**을 실행하세요. Lively가 이전 설정 파일 복사본을 유지하고 있을 때 발생할 수 있습니다.

## 개인정보와 네트워크

컨트롤러는 외부 서버에 연결하지 않으며 `http://127.0.0.1:39271`에서 허용된 로컬 요청만 처리합니다. 이미지와 배치 파일도 현재 Windows 사용자 계정의 로컬 폴더에 저장됩니다. 사용자가 URL 배경을 직접 설정한 경우에는 배경화면이 해당 이미지 주소에 연결합니다.

## 제거하기

1. 컨트롤러 압축 해제 폴더의 `Uninstall-Controller.cmd`를 실행합니다.
2. Lively에서 **Liquid Glass Icons** 배경화면을 제거합니다.

기본 제거는 저장된 배치와 이미지 라이브러리를 보존합니다. 모두 삭제하려면 압축 해제한 컨트롤러 폴더에서 다음 명령어를 실행합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall.ps1 -RemoveSavedLayout -RemoveImageLibrary -RemoveBackground
```

이 명령은 저장된 배치, 사용자 이미지 라이브러리, 직접 선택한 배경 파일까지 삭제하므로 필요한 파일을 먼저 백업하세요.

## 개발자용

로컬 개발 서버 실행:

```powershell
npm run dev
```

브라우저에서 `http://localhost:4173`을 엽니다. 외부 이미지와 저장된 배치를 표시하려면 설치된 컨트롤러가 실행 중이어야 합니다.

구문 검사와 전체 패키지 빌드:

```powershell
npm run check
npm run build:all
```

결과물은 `dist`에 생성됩니다. 사용하지 않은 `v*` 태그를 GitHub에 푸시하면 `.github/workflows/release.yml`이 검사와 빌드를 실행하고 세 ZIP을 GitHub Release에 첨부합니다.
