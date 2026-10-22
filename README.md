# Alcina Office Tools

Suíte de produtividade própria da **Alcina Dados TI** — planilha, documentos, apresentações, notas e BI — com os mesmos recursos do pacote Office, construída do zero (clean-room) e compatível com os arquivos que os usuários já têm.

> **Status:** suíte completa implementada e distribuída como **um único aplicativo** (`apps/office`) — a Central abre cada ferramenta (Planilhas, Documentos, Apresentações, Notas e Analytics) em sua própria janela, com um só instalador e uma só atualização automática, para Windows e Linux.
>
> 📥 **Quer só instalar e usar?** Veja o **[guia de instalação (INSTALAR.md)](INSTALAR.md)** ou baixe o instalador único em **[Releases → office](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/office)**.

## Princípios clean-room

Parecer familiar sem ser uma cópia. Layout e fluxos de uso são convenções livres; código, arte e marca são 100% Alcina.

1. **Código próprio** — escrito do zero, reproduzindo *o que* cada recurso faz a partir de conhecimento público; nunca descompilando binários.
2. **Layout familiar** — faixa de opções (ribbon), grade de células, painel de slides: convenções de uso não protegidas.
3. **Ícones e visual próprios** — conjunto desenhado do zero, identidade verde / dourado / branco.
4. **Formatos abertos** — ler e gravar `.xlsx` `.docx` `.pptx` é interoperabilidade legítima (padrão público OOXML / ECMA-376 / ISO/IEC 29500).
5. **Licenças compatíveis** — apenas bibliotecas MIT/Apache; nada de GPL em produto comercial.
6. **Inconfundivelmente Alcina** — o usuário reconhece o produto como da Alcina, não como um clone do Office.

## A suíte

| Aplicativo | Equivalente | Formato aberto | Peça-chave de engenharia |
|---|---|---|---|
| **Planilhas** | Excel | `.xlsx` | Motor de fórmulas próprio (grade + recálculo) |
| **Documentos** | Word | `.docx` | Editor de texto rico + paginação |
| **Apresentações** | PowerPoint | `.pptx` | Tela de slides (reaproveita o canvas do BI) |
| **Notas** | OneNote | `.md` / próprio | Cadernos e blocos de anotação |
| **Analytics** | Power BI | `.alcbi` | Pronto — a ser integrado à suíte |

## Estrutura do monorepo

```
alcina-office-tools/
├── packages/            # compartilhado entre todos
│   ├── brand/           # cores, ícones próprios, tema Fluent
│   ├── ui-shell/        # barra de título, ribbon, backstage, diálogos
│   ├── ooxml/           # ler/gravar .xlsx .docx .pptx (OPC + XML)
│   ├── engine/          # dados, fórmulas, DAX (do AlcinaBi)
│   └── updater/         # auto-update (electron-updater + Render)
├── apps/
│   ├── office/          # ★ app único distribuído (Central + todas as ferramentas em janelas)
│   ├── sheets/          # Planilhas  (app separado, base do office)
│   ├── docs/            # Documentos (app separado, base do office)
│   ├── point/           # Apresentações (app separado, base do office)
│   ├── notes/           # Notas      (app separado, base do office)
│   └── bi/              # Analytics  (app separado, base do office)
└── build/               # electron-builder: Windows + Linux
```

## Pilha técnica

Electron + electron-vite + React 19 + Fluent UI v9 + TypeScript + ECharts — a mesma já comprovada no AlcinaBi. Gerenciador de pacotes: pnpm (workspaces).

## Formatos e licenças

| Biblioteca | Uso | Licença | Comercial |
|---|---|---|---|
| SheetJS | ler `.xlsx/.xls/.ods` | Apache-2.0 | OK |
| ExcelJS | gravar `.xlsx` com estilos | MIT | OK |
| ProseMirror | editor (Docs/Notes) | MIT | OK |
| mammoth | ler `.docx` → HTML | BSD-2 | OK |
| docx (dolanmiu) | gravar `.docx` | MIT | OK |
| pptxgenjs | gravar `.pptx` | MIT | OK |
| HyperFormula | motor de fórmulas | GPLv3 | **Evitar → motor próprio** |
| js-pptx | ler `.pptx` | GPL | **Evitar → leitura própria** |

As peças GPL obrigariam o produto inteiro a virar GPL (incompatível com venda). Por isso o **motor de fórmulas** e a **leitura de `.pptx`** serão próprios, reaproveitando os padrões do motor do AlcinaBi.

## Distribuição e atualização automática

- **Instaladores** via `electron-builder`:
  - Windows: `.exe` (NSIS) + versão portátil
  - Linux: `AppImage`, `.deb`, `.rpm`
  - Cada SO compila no seu ambiente, ou tudo via CI (GitHub Actions).
- **Atualização automática** via `electron-updater` com provedor *genérico*:
  - Um servidor no **Render** serve `latest.yml` / `latest-linux.yml` + instaladores.
  - Fluxo: `deploy no Render → app verifica latest.yml → "Atualização disponível" → baixa + reinicia`.
- *Observação:* no Windows, instaladores sem certificado de assinatura disparam o aviso SmartScreen; decidir sobre certificado na fase de distribuição.

## Roteiro por fases

1. **Base da suíte** — monorepo, `brand`, `ui-shell`, `updater` e um app "casca" instalável já com auto-update.
2. **Planilhas** — grade + motor de fórmulas próprio + import/export `.xlsx` + gráficos.
3. **Documentos** — editor ProseMirror + leitura/escrita `.docx` + paginação e PDF.
4. **Apresentações** — canvas de slides + leitura/escrita `.pptx` + modo apresentador.
5. **AlcinaNotes + integração** — notas, AlcinaBi migrado e instaladores Windows/Linux finalizados.

## Aviso legal

Todo o trabalho é código original (clean-room). A interoperabilidade com arquivos do Office usa o padrão aberto OOXML. Nenhum binário, ícone ou marca da Microsoft é copiado.
