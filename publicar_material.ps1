# Atualiza a lista do Material de apoio (docs/js/material.js) e publica no GitHub.
# Uso: dois cliques em publicar_material.bat. Com -SoGerar, apenas gera a lista.
param([switch]$SoGerar)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$lista = @(Get-ChildItem -LiteralPath (Join-Path $raiz 'docs\material_apoio') -File |
    Where-Object { $_.Name -ne 'LEIA-ME.txt' -and $_.Name -notlike '~$*' } |
    Sort-Object Name |
    ForEach-Object { [pscustomobject]@{ nome = $_.Name; tamanho = $_.Length; data = $_.LastWriteTime.ToString('yyyy-MM-dd') } })
$json = ConvertTo-Json -InputObject $lista -Compress
$texto = "// Gerado por publicar_material.bat. Nao edite a mao.`nwindow.MATERIAL = $json;`n"
[IO.File]::WriteAllText((Join-Path $raiz 'docs\js\material.js'), $texto, (New-Object Text.UTF8Encoding($false)))
Write-Host "$($lista.Count) arquivo(s) na lista."
if ($SoGerar) { exit 0 }
Set-Location -LiteralPath $raiz
git add docs/material_apoio docs/js/material.js
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Host 'Nada novo para publicar.'; exit 0 }
git commit -m 'Atualiza material de apoio'
if ($LASTEXITCODE -ne 0) { throw 'Falha no commit.' }
git push
if ($LASTEXITCODE -ne 0) { throw 'Falha no envio ao GitHub.' }
Write-Host 'Publicado. O site atualiza em alguns minutos.'
