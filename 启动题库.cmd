@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动题库知识库...
start "" "http://127.0.0.1:5000"
python -m http.server 5000 --bind 127.0.0.1
