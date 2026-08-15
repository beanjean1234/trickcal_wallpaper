# Trickcal Wallpaper Controller

Lively 배경화면과 별도의 오브젝트 관리창을 연결하는 Windows용 로컬 컨트롤러입니다.

## 담당 기능

- 오브젝트 관리창 열기 및 닫기(Chrome 우선, 설치되어 있지 않으면 Edge 사용)
- `%LOCALAPPDATA%\TrickcalWallpaper\layout.json`에 배치 저장
- `%LOCALAPPDATA%\TrickcalWallpaper\Library`의 분류 폴더와 이미지 자동 검색
- 라이브러리 이미지의 로컬 제공
- 이미지 라이브러리 폴더 열기
- ZIP 이미지 팩 가져오기

## 설치 파일

- `Install-Controller.cmd`: 현재 사용자 계정에 설치하고 로그인 자동 시작을 등록합니다.
- `Uninstall-Controller.cmd`: 컨트롤러를 제거합니다. 배치와 이미지 라이브러리는 기본적으로 보존합니다.
- `Install.ps1`: `-NoAutoStart` 옵션을 지원하는 고급 설치 스크립트입니다.
- `Uninstall.ps1`: `-RemoveSavedLayout`, `-RemoveImageLibrary` 옵션을 지원합니다.

컨트롤러는 외부 네트워크에 연결하지 않고 `http://127.0.0.1:39271`에서 허용된 로컬 출처의 요청만 받습니다.
