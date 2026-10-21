# Servidor de atualizações — Alcina Office

Servidor estático mínimo (Node, sem dependências) que serve o **feed de atualização** lido pelos aplicativos (via `electron-updater`, provedor `generic`).

> **Atualização (canal atual):** o auto-update agora é servido pelos **GitHub Releases** do próprio repositório — cada app tem um Release "rolante" (tag = nome do app: `shell`, `sheets`, `docs`, `point`, `notes`, `bi`) atualizado automaticamente pelo workflow `build.yml`. O `publish.url`/feed de cada app aponta para `https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/download/<app>`. Este servidor Render **não é mais necessário** e fica aqui apenas como alternativa de hospedagem própria (para usar, defina `ALCINA_UPDATE_URL`).

## Como os apps procuram a atualização

Cada app aponta para `https://<host>/<app>`. O padrão compilado é:

```
https://alcina-office-updates.onrender.com/<app>
```

onde `<app>` é um de: `shell`, `sheets`, `docs`, `point`, `notes`, `bi`.

> Para apontar para outro host, defina a variável de ambiente **`ALCINA_UPDATE_URL`** ao iniciar o app, ou edite o campo `publish.url` no `electron-builder.yml` de cada app antes de gerar os instaladores.

## Estrutura dos arquivos

Coloque os artefatos gerados (pelo CI ou por `npm run dist`) em `public/`, **um subdiretório por app**:

```
public/
  bi/
    latest.yml                      # feed Windows
    latest-linux.yml                # feed Linux
    AlcinaBi-1.0.0-win-x64.exe
    AlcinaBi-1.0.0-win-x64.exe.blockmap
    AlcinaBi-1.0.0-linux-x64.AppImage
    ...
  sheets/
    latest.yml
    ...
  docs/ ...
  point/ ...
  notes/ ...
  shell/ ...
```

Os arquivos `latest.yml` / `latest-linux.yml` e os `.blockmap` são gerados automaticamente pelo `electron-builder` junto com os instaladores (ficam na pasta `release/` de cada app).

## Publicar no Render

**Opção A — Blueprint (recomendado):** no painel do Render, *New → Blueprint* e aponte para este repositório. O arquivo `render.yaml` (na raiz) já define o serviço `alcina-office-updates` com `rootDir: server/update`.

**Opção B — manual:** *New → Web Service*, conecte o repositório e configure:

- **Root Directory:** `server/update`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Runtime:** Node

O servidor escuta na porta de `process.env.PORT` (fornecida pelo Render).

## Fluxo de uma atualização

1. Suba a versão nos `package.json` dos apps e gere os instaladores (CI em `.github/workflows/build.yml`, ou `npm run dist` em cada app).
2. Copie os artefatos de cada app para `server/update/public/<app>/`.
3. Faça deploy no Render (ou deixe o deploy automático do Render a cada push, se configurado).
4. Ao abrir, cada app consulta `latest(.yml|-linux.yml)`, compara a versão e baixa a atualização.

## Observações

- A atualização automática só funciona no **app instalado** (não em `npm run dev`).
- No **Windows**, instaladores sem certificado de assinatura (code signing) exibem o aviso do SmartScreen. Para produção, considere um certificado.
- O plano gratuito do Render hiberna o serviço quando ocioso; a primeira verificação após a hibernação pode demorar alguns segundos.
