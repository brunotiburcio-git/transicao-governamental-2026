@echo off
REM Atualiza a lista do Material de apoio e publica no GitHub.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar_material.ps1"
pause
