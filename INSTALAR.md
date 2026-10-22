# Instalar o Alcina Office

Guia rápido para **instalar e usar** o Alcina Office (Windows e Linux). Não é preciso conta, servidor nem nada pago — tudo funciona **localmente** (inclusive **offline**).

> **Um só programa, uma só instalação.** O Alcina Office instala como **um único aplicativo**: ao abrir, você vê a **Central**, e dali abre cada ferramenta (Planilhas, Documentos, Apresentações, Notas e Analytics) em sua própria janela — como no pacote Office.

## 1. Baixar

O instalador fica na página de **Releases** do projeto:

➡️ **https://github.com/alcinadadosti-worspace/AlcinaOfficeTools/releases/tag/office**

Baixe **um** arquivo, conforme o seu sistema:

| Sistema | Arquivo a baixar |
|---|---|
| **Windows 10/11 (64 bits)** | `AlcinaOffice-<versão>-win-x64.exe` |
| **Linux (qualquer distribuição)** | `AlcinaOffice-<versão>-linux-x86_64.AppImage` |
| **Linux (Debian/Ubuntu/Mint)** | `AlcinaOffice-<versão>-linux-amd64.deb` |

## 2. Instalar no Windows

1. Dê **duplo clique** no `.exe` baixado.
2. Se aparecer a tela azul **"O Windows protegeu o computador"** (SmartScreen), clique em **"Mais informações" → "Executar assim mesmo"**. Isso acontece porque o instalador ainda não tem certificado de assinatura — é normal e seguro para uso próprio.
3. Siga o assistente (você pode escolher a pasta de instalação). Ao final, o programa fica no **Menu Iniciar** como **"Alcina Office"**.

Para desinstalar: **Configurações → Aplicativos** (ou Painel de Controle → Programas), procure por "Alcina Office".

## 3. Instalar no Linux

**AppImage (qualquer distribuição):**
```bash
chmod +x AlcinaOffice-*-linux-x86_64.AppImage
./AlcinaOffice-*-linux-x86_64.AppImage
```

**.deb (Debian / Ubuntu / Mint):**
```bash
sudo apt install ./AlcinaOffice-*-linux-amd64.deb
# ou: sudo dpkg -i AlcinaOffice-*-linux-amd64.deb
```

## 4. Como usar

Abra o **Alcina Office** pelo atalho. Na **Central**, clique no aplicativo desejado:

| Na Central | Equivale a |
|---|---|
| **Planilhas** | Excel |
| **Documentos** | Word |
| **Apresentações** | PowerPoint |
| **Notas** | OneNote |
| **Analytics** | Power BI |

Cada ferramenta abre em sua própria janela. Você pode ter várias abertas ao mesmo tempo.

## 5. Atualizações automáticas

O Alcina Office **verifica sozinho** se há uma versão nova ao abrir e baixa a atualização em segundo plano (quando houver). Isso é a **única** coisa que usa internet.

- **Sem internet:** o programa funciona **normalmente** — só não verifica atualização.
- A atualização automática só vale para o **programa instalado** (não no modo de desenvolvimento).

## 6. Requisitos

- **Windows 10 ou 11** (64 bits).
- **Linux** 64 bits (glibc recente — Ubuntu 20.04+ ou equivalente).

## 7. Compatibilidade de arquivos

Os aplicativos abrem e salvam os formatos abertos que você já usa: **`.xlsx`** (Planilhas), **`.docx`** (Documentos), **`.pptx`** (Apresentações). Também têm o formato próprio de cada um (`.alcsheet`, `.alcdoc`, `.alcpoint`, `.alcnotes`, `.alcbi`) para preservar 100% dos recursos.

---

Dúvidas ou problemas? Abra uma *issue* no repositório.
