# Trickcal Liquid Glass Wallpaper

마우스 위치에 따라 기울기와 반사광이 변하는 유리 아이콘 Lively Wallpaper입니다. 배경화면 본체와 이미지 라이브러리를 분리해, 이미지를 추가할 때 배경화면을 다시 설치하지 않아도 됩니다.

## 구성

- `liquid-glass-icons-lively.zip`: Lively 배경화면 본체
- `trickcal-wallpaper-controller.zip`: 오브젝트 관리, 배치 저장, 이미지 라이브러리를 담당하는 로컬 컨트롤러
- `trickcal-wallpaper-images.zip`: 선택적으로 설치하는 이미지 팩

컨트롤러는 현재 Windows 사용자 계정에만 설치되며 `127.0.0.1:39271`에서 로컬 요청만 처리합니다.

## 설치

1. Releases에서 위 ZIP 파일 3개를 내려받습니다.
2. `liquid-glass-icons-lively.zip`을 Lively로 드래그해 설치합니다.
3. `trickcal-wallpaper-controller.zip`을 일반 폴더에 압축 해제합니다.
4. 압축을 푼 폴더에서 `Install-Controller.cmd`를 실행합니다.
5. Lively 설정의 `오브젝트 관리 및 배치`를 누릅니다.
6. 관리창에서 `팩 가져오기`를 눌러 `trickcal-wallpaper-images.zip`을 선택합니다.

기존 버전에서 업데이트하면 컨트롤러 설치 프로그램이 예전 컨트롤러에 포함된 이미지를 새 라이브러리로 자동 복사합니다. 같은 이름의 개인 파일은 덮어쓰지 않습니다.

## 이미지 추가

관리창에서 `폴더 열기`를 누르면 다음 라이브러리가 열립니다.

```text
%LOCALAPPDATA%\TrickcalWallpaper\Library
├─ 요정\
├─ 용족\
├─ 유령\
└─ 원하는 새 분류\
```

지원 형식은 WebP, PNG, JPG, JPEG입니다. 분류 폴더나 이미지를 추가한 뒤 `새로고침`을 누르면 즉시 목록에 반영됩니다. 이 작업에는 배경화면이나 컨트롤러 재설치가 필요하지 않습니다.

## 이미지 팩 형식

```text
image-pack.zip
├─ pack.json
└─ images
   ├─ 요정
   │  └─ example.webp
   └─ 마녀
      └─ example.webp
```

`pack.json`은 식별 및 버전 표시를 위한 선택 메타데이터입니다. 현재 가져오기 기능은 `images` 아래의 지원 이미지 파일을 라이브러리에 병합하며, 같은 상대 경로가 있으면 새 파일로 갱신합니다.

## 개발 실행

```powershell
npm run dev
```

브라우저에서 `http://localhost:4173`을 엽니다. 외부 이미지와 저장된 배치를 표시하려면 설치된 컨트롤러가 실행 중이어야 합니다.

## 전체 패키지 빌드

```powershell
npm run check
npm run build:all
```

결과물은 `dist`에 생성됩니다. `v*` 태그를 GitHub에 푸시하면 `.github/workflows/release.yml`이 검사와 빌드를 실행하고 3개 ZIP을 GitHub Release에 첨부합니다.

## 제거

컨트롤러 압축 해제 폴더의 `Uninstall-Controller.cmd`를 실행합니다. 기본 제거는 저장된 배치와 이미지 라이브러리를 보존합니다.

고급 제거 옵션:

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall.ps1 -RemoveSavedLayout -RemoveImageLibrary
```
