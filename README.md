# Transição Governamental 2026: coleta de informações

Site simples para as áreas registrarem as informações da transição: Responsável (unidade), Tipo, Título,
Descrição (até 2.000 caracteres) e, para colegiados, Ato de criação. A lista de títulos depende da unidade e do
tipo escolhidos. Todos os usuários veem a mesma tabela, guardada numa planilha Google.

## Como funciona

- O site (pasta `docs/`) fica no GitHub Pages.
- Os dados, usuários e listas ficam numa planilha Google, na conta do administrador.
- O script `apps_script/Codigo.gs`, dentro dessa planilha, é o servidor: confere login e perfil a cada pedido e grava os dados.
- A planilha não é compartilhada com os usuários: eles só usam o site.

## Estrutura

```
apps_script/Codigo.gs   servidor (copiado para o Apps Script da planilha Google)
planilha_google.xlsx    planilha inicial para enviar ao Google. Não vai para o GitHub
tabelas_sistema.xlsx    origem das listas. Não vai para o GitHub
dados/usuarios.xlsx     primeira versão dos usuários. Não vai para o GitHub
ver_pagina.bat          abre a página em http://localhost:8765 para conferir
docs/                   o site publicado
  index.html
  style.css
  imagens/
  js/app.js             telas, exportação e importação
  js/config.js          endereço do servidor no Google
  js/xlsx.mini.min.js   biblioteca SheetJS, para ler e gravar Excel
```

No VS Code: *File > Open Folder* nesta pasta.

## Instalar no Google (uma vez)

1. Em drive.google.com, clique em *Novo > Upload de arquivo* e envie `planilha_google.xlsx`.
2. Abra o arquivo e use *Arquivo > Salvar como Planilhas Google*. Trabalhe nessa nova cópia e apague o .xlsx do Drive.
3. Na planilha, abra *Extensões > Apps Script*. Apague o conteúdo do editor, cole todo o `apps_script/Codigo.gs` e salve.
4. Clique em *Implantar > Nova implantação*. Em tipo, escolha *App da Web*.
5. Em *Executar como*, escolha *Eu*. Em *Quem pode acessar*, escolha *Qualquer pessoa*. Clique em *Implantar* e autorize.
   Esse acesso só permite chamar o script, que pede login. Ninguém ganha acesso à planilha.
6. Copie o endereço terminado em `/exec` e coloque em `docs/js/config.js`.
7. Abra `ver_pagina.bat` e teste o login.

Se você alterar o `Codigo.gs` depois: *Implantar > Gerenciar implantações*, edite a implantação e escolha *Nova versão*.
O endereço continua o mesmo.

## Rotina

Tudo é feito na planilha Google e vale na hora, sem publicar o site de novo:

- **Usuários:** aba `usuarios`, com as colunas `usuario | nome | senha | perfil`. Para tirar um acesso, apague a linha.
- **Listas:** abas `opc_tipo`, `opc_unidade` e `opc_titulo`.
- **Dados:** aba `registros`. Evite alterar a ordem das colunas. Para baixar: *Arquivo > Fazer download > Microsoft Excel*.

## Perfis

| Perfil | Pode |
|---|---|
| admin | tudo: cadastrar, editar e excluir qualquer registro, exportar e importar |
| cadastrador | cadastrar, editar e excluir os próprios registros, exportar e consultar tudo |
| consulta | apenas visualizar |

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e envie esta pasta (o `.gitignore` deixa de fora `dados/`, as planilhas, o Word e o PDF).
2. Em *Settings > Pages*, escolha Branch `main`, pasta `/docs`.
3. Como o domínio tiburciobruno.com.br já aponta para o GitHub Pages, o site fica em
   `https://tiburciobruno.com.br/<nome-do-repositorio>/`.

## Segurança

- Login e perfis são conferidos no Google. Após 5 senhas erradas, o usuário fica bloqueado por 15 minutos.
- A sessão dura até 6 horas.
- As senhas ficam legíveis na aba `usuarios`. Não compartilhe a planilha, e use senhas longas e diferentes das de outros sistemas.
- Quem tiver acesso à conta Google vê tudo: ative a verificação em duas etapas.
- O serviço gratuito do Google tem limites de uso e não oferece garantia de disponibilidade. Baixe cópias da planilha com frequência.
