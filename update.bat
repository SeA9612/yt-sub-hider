@echo off
chcp 65001 >nul
setlocal
title 구독 가리개 업데이트

rem 이 파일이 있는 폴더 = 확장 프로그램 설치 폴더
set "DEST=%~dp0"
if not exist "%DEST%manifest.json" (
  echo [오류] 이 파일은 구독 가리개 폴더^(manifest.json이 있는 폴더^) 안에서 실행해야 합니다.
  pause
  exit /b 1
)

set "UPD_TMP=%TEMP%\yt-sub-hider-update"
echo.
echo  구독 가리개 최신 버전을 내려받는 중입니다...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $t=$env:UPD_TMP; if(Test-Path $t){Remove-Item $t -Recurse -Force}; New-Item -ItemType Directory $t | Out-Null; Invoke-WebRequest 'https://github.com/SeA9612/yt-sub-hider/archive/refs/heads/main.zip' -OutFile (Join-Path $t 'main.zip') -UseBasicParsing; Expand-Archive (Join-Path $t 'main.zip') $t -Force"
if errorlevel 1 (
  echo [오류] 내려받기에 실패했습니다. 인터넷 연결을 확인해 주세요.
  pause
  exit /b 1
)

if not exist "%UPD_TMP%\yt-sub-hider-main\manifest.json" (
  echo [오류] 내려받은 파일이 올바르지 않습니다.
  pause
  exit /b 1
)

rem 실행 중인 update.bat 자신은 덮어쓰지 않는다
robocopy "%UPD_TMP%\yt-sub-hider-main" "%DEST%." /E /XF update.bat /NFL /NDL /NJH /NJS /NP >nul
if %errorlevel% geq 8 (
  echo [오류] 파일을 덮어쓰지 못했습니다. 크롬이 아닌 다른 프로그램이 폴더를 쓰고 있는지 확인해 주세요.
  pause
  exit /b 1
)
rmdir /s /q "%UPD_TMP%" 2>nul

echo  업데이트 파일을 덮어썼습니다.
echo.
echo  이제 구독 가리개 설정창 맨 아래의 [다시 불러오기] 버튼을 누르거나,
echo  chrome://extensions 에서 구독 가리개의 새로고침^(↻^) 버튼을 눌러 주세요.
echo.
pause
