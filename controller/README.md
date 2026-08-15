# Trickcal Wallpaper Controller

이 컨트롤러는 Lively 웹 배경화면의 오브젝트 배치 버튼과 Microsoft Edge 앱 창을 연결합니다.

- `Install-Controller.cmd`: 더블클릭하면 현재 사용자 계정에 컨트롤러를 설치하고 자동 시작을 등록합니다.
- `Uninstall-Controller.cmd`: 더블클릭하면 컨트롤러를 제거합니다. 저장한 배치는 유지합니다.
- `Install.ps1`: 고급 설치용 스크립트입니다. `-NoAutoStart`를 사용하면 자동 시작을 등록하지 않습니다.
- `Uninstall.ps1`: 고급 제거용 스크립트입니다. `-RemoveSavedLayout`을 사용하면 저장한 배치도 삭제합니다.
- `Start-Controller.ps1`: 로그인 자동 시작과 수동 실행에 사용하는 숨김 런처입니다.
- 통신 주소: `http://127.0.0.1:39271`
- 배치 저장 위치: `%LOCALAPPDATA%\TrickcalWallpaper\layout.json`

컨트롤러는 외부 네트워크에 연결하지 않으며 루프백 주소에서만 요청을 받습니다.
