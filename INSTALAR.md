# Instalar o Alcina Office

Guia rápido para **instalar e usar** a suíte Alcina Office (Windows e Linux). Não é preciso conta, servidor nem nada pago — os aplicativos funcionam **localmente** (inclusive **offline**).

## 1. Baixar

Todos os instaladores ficam na página de **Releases** do projeto:

➡️ **https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases**

Cada aplicativo tem seu próprio release. Abra o do app desejado e baixe o arquivo da sua plataforma:

| Aplicativo | Equivale a | Baixar (release) | Arquivo |
|---|---|---|---|
| **Planilhas** | Excel | [releases/tag/sheets](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/sheets) | `AlcinaOffice-Planilhas-…` |
| **Documentos** | Word | [releases/tag/docs](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/docs) | `AlcinaOffice-Documentos-…` |
| **Apresentações** | PowerPoint | [releases/tag/point](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/point) | `AlcinaOffice-Apresentacoes-…` |
| **Notas** | OneNote | [releases/tag/notes](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/notes) | `AlcinaOffice-Notas-…` |
| **Analytics** | Power BI | [releases/tag/bi](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/bi) | `AlcinaOffice-Analytics-…` |
| **Central** | (tela inicial da suíte) | [releases/tag/shell](https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/shell) | `AlcinaOffice-Central-…` |

> Cada app é **independente** — instale só os que quiser. A **Central** é a tela de boas-vindas da suíte; na versão instalada, abra cada aplicativo pelo seu próprio atalho.

- **Windows:** baixe o arquivo que termina em **`-win-x64.exe`**.
- **Linux:** baixe o **`-linux-x86_64.AppImage`** (roda em qualquer distribuição) **ou** o **`-linux-amd64.deb`** (Debian/Ubuntu).

## 2. Instalar no Windows

1. Dê **duplo clique** no `.exe` baixado.
2. Se aparecer a tela azul **"O Windows protegeu o computador"** (SmartScreen), clique em **"Mais informações" → "Executar assim mesmo"**. Isso acontece porque o instalador ainda não tem certificado de assinatura — é normal e seguro para uso próprio.
3. Siga o assistente (você pode escolher a pasta de instalação). Ao final, o app fica no **Menu Iniciar** com o nome **"Alcina Office — <App>"**.

Para desinstalar: **Configurações → Aplicativos** (ou Painel de Controle → Programas), procure por "Alcina Office".

## 3. Instalar no Linux

**AppImage (qualquer distribuição):**
```bash
chmod +x AlcinaOffice-Planilhas-*-linux-x86_64.AppImage
./AlcinaOffice-Planilhas-*-linux-x86_64.AppImage
```

**.deb (Debian / Ubuntu / Mint):**
```bash
sudo apt install ./AlcinaOffice-Planilhas-*-linux-amd64.deb
# ou: sudo dpkg -i AlcinaOffice-Planilhas-*-linux-amd64.deb
```

## 4. Atualizações automáticas

Cada aplicativo **verifica sozinho** se há uma versão nova ao abrir e baixa a atualização em segundo plano (quando houver). Isso é a **única** coisa que usa internet.

- **Sem internet:** os apps funcionam **normalmente** — só não verificam atualização.
- A atualização automática só vale para o **app instalado** (não no modo de desenvolvimento).

## 5. Requisitos

- **Windows 10 ou 11** (64 bits).
- **Linux** 64 bits (glibc recente — Ubuntu 20.04+ ou equivalente).

## 6. Compatibilidade de arquivos

Os apps abrem e salvam os formatos abertos que você já usa: **`.xlsx`** (Planilhas), **`.docx`** (Documentos), **`.pptx`** (Apresentações). Também têm o formato próprio de cada um (`.alcsheet`, `.alcdoc`, `.alcpoint`, `.alcnotes`, `.alcbi`) para preservar 100% dos recursos.

---

Dúvidas ou problemas? Abra uma *issue* no repositório.
