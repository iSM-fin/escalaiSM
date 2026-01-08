# Anest Escl - Sistema de Escalas de Anestesiologia

Este projeto é um gerenciador de escalas médicas avançado, com funcionalidades de sincronização em tempo real (Firestore), controle financeiro e gestão de plantões.

## 🚀 Workflow de Desenvolvimento (CI/CD)

Este projeto utiliza um fluxo de trabalho profissional para garantir a estabilidade e segurança dos dados. **Nunca edite diretamente na branch `main`.**

### Passo a Passo para Atualizações

1.  **Crie uma nova Branch**
    Antes de começar qualquer tarefa, crie uma ramificação (branch) separada:
    ```bash
    git checkout -b nome-da-sua-tarefa
    # Ex: git checkout -b corrigir-cor-botao
    ```

2.  **Desenvolva e Teste Localmente**
    Faça suas alterações e teste no seu computador:
    ```bash
    npm run dev
    ```

3.  **Salve suas Alterações (Commit)**
    ```bash
    git add .
    git commit -m "Descrição breve do que você fez"
    ```

4.  **Envie para o GitHub**
    ```bash
    git push -u origin nome-da-sua-tarefa
    ```

5.  **Crie um Pull Request (PR)**
    *   Vá para a página do repositório no GitHub.
    *   Você verá um botão verde "Compare & pull request". Clique nele.
    *   Descreva suas mudanças e crie o PR.

6.  **Teste no Ambiente de Staging (Preview)**
    *   Assim que o PR for criado, um "robô" (GitHub Action) entrará em ação.
    *   Aguarde o comentário do **firebase-hosting-preview-bot** no seu PR.
    *   Ele fornecerá um **link de teste** (ex: `https://escala-ism--pr-1.web.app`).
    *   Acesse esse link para ver como suas alterações ficaram "ao vivo" sem afetar o site principal.

7.  **Aprovação e Deploy Oficial**
    *   Se tudo estiver correto no link de teste, aprove e faça o **Merge** do Pull Request.
    *   Isso disparará automaticamente o deploy para o site oficial (Produção).

---

## 🛠️ Instalação Local

1.  **Instale as dependências:**
    ```bash
    npm install
    ```

2.  **Rode o servidor de desenvolvimento:**
    ```bash
    npm run dev
    ```

## 🔐 Segurança e Backup

*   **Trava de Segurança:** O app possui um mecanismo que impede o salvamento de dados se a estrutura crítica (hospitais, meses) não for carregada, prevenindo sobrescrita acidental.
*   **Backup Manual:** No menu de Administração, existe um botão **"Backup Banco (Console)"** que gera um JSON completo do estado atual para salvaguarda.
