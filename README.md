# Liquid Glass Icons Wallpaper

WebGL 하늘 배경 위에서 마우스 위치에 따라 기울어지고 반사광이 변하는 유리 아이콘 배경화면입니다.

## 개발 실행

```powershell
npm run dev
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 전체 패키지 빌드

```powershell
npm run build:all
```

다음 두 파일이 생성됩니다.

- `dist/liquid-glass-icons-lively.zip`: Lively 배경화면
- `dist/trickcal-wallpaper-controller.zip`: 오브젝트 배치 전용 창 컨트롤러

## 설치

1. Lively에서 기존 Liquid Glass Icons 항목을 제거합니다.
2. `dist/liquid-glass-icons-lively.zip`을 Lively로 드래그합니다.
3. `dist/trickcal-wallpaper-controller.zip`을 일반 폴더에 압축 해제합니다.
4. 압축을 푼 폴더에서 `Install-Controller.cmd`를 더블클릭합니다.
5. 배경화면 오른쪽 위 설정 버튼에서 `오브젝트 배치`를 누릅니다.

컨트롤러는 현재 사용자 계정으로만 설치되고 로그인 시 자동 실행됩니다. 배치 좌표는
`%LOCALAPPDATA%\TrickcalWallpaper\layout.json`에 저장됩니다.

## 배치 모드

- 전용 Microsoft Edge 앱 창이 최대화된 상태로 열립니다.
- 카드를 마우스로 드래그하거나 방향키로 이동할 수 있습니다.
- Shift와 방향키를 함께 누르면 더 큰 간격으로 이동합니다.
- `배치 저장`은 좌표를 저장하고 창을 닫습니다.
- `취소`는 저장하지 않고 창을 닫습니다.
- `초기 배치`는 카드들을 격자로 다시 정렬합니다.

일반 Lively 배경화면에서는 카드 드래그를 비활성화했습니다. Windows 바탕화면의 영역 선택과 충돌하지 않습니다.

## 제거

컨트롤러 압축 해제 폴더의 `Uninstall-Controller.cmd`를 실행합니다. 기본 제거는 저장된 배치 정보를 유지합니다.
