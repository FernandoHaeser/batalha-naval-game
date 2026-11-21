# Deploy: front na Vercel + modo online

## Por que dois serviços?

O modo online usa **Socket.IO** (WebSocket), que precisa de um processo Node.js **rodando o tempo todo** e guardando as salas em memória. A Vercel roda funções serverless, que são efêmeras e não mantêm conexões WebSocket abertas. Por isso o deploy fica dividido em dois:

| Parte | Onde | O que roda |
| --- | --- | --- |
| Front (HTML/CSS/JS) | **Vercel** | conteúdo estático da pasta `public/` |
| Servidor online | **Render** (ou Railway, Fly.io, VPS) | `server.js` (Express + Socket.IO) |

```
Navegador ──HTTP──▶ Vercel (public/)
    │
    └────WebSocket──▶ Render (server.js)  ← salas, turnos, ataques
```

Os modos **PvE** e **PvP local** funcionam só com a Vercel. O servidor só é necessário para o **modo online**.

---

## 1. Subir o servidor online (Render)

O repositório já inclui um `render.yaml` com a configuração.

1. Crie uma conta em <https://render.com> e conecte seu GitHub.
2. **New → Blueprint** e selecione este repositório. O Render lê o `render.yaml` e cria o serviço `batalha-naval-online`.
   - Se preferir fazer manualmente: **New → Web Service**, runtime **Node**, build `npm install`, start `npm start`, health check `/health`.
3. Por enquanto, deixe a variável `CORS_ORIGIN` vazia. Ela é preenchida no passo 3.
4. Quando o deploy terminar, copie a URL do serviço, por exemplo `https://batalha-naval-online.onrender.com`.
5. Teste abrindo `https://batalha-naval-online.onrender.com/health`. O retorno esperado é `{"ok":true,"rooms":0}`.

> No plano gratuito o Render desliga o serviço depois de cerca de 15 min sem uso. A primeira conexão depois disso pode levar de 30 a 60 s enquanto o servidor acorda.

### Alternativa: Railway / Fly.io / VPS

Qualquer host que rode `npm start` com um processo Node persistente serve. O servidor usa a variável `PORT` fornecida pelo host (padrão `3000`).

---

## 2. Subir o front na Vercel

O repositório já inclui `vercel.json` e `.vercelignore`:

- `vercel.json` publica só a pasta `public/` como site estático (`framework: null`, `outputDirectory: public`) e, no build, roda `scripts/build-config.js`.
- `.vercelignore` exclui o `server.js`, para a Vercel não tentar transformá-lo em função serverless.

Passos:

1. Em <https://vercel.com>, **Add New → Project** e importe o repositório.
2. Em **Environment Variables**, adicione:

   | Nome | Valor |
   | --- | --- |
   | `SOCKET_SERVER_URL` | URL do servidor do passo 1 (ex.: `https://batalha-naval-online.onrender.com`) |

3. Não altere Framework, Build Command nem Output Directory: o `vercel.json` já define tudo.
4. Clique em **Deploy** e copie a URL final (ex.: `https://batalha-naval-game-three.vercel.app`).

### Projeto que já existe na Vercel

Se o projeto já estava publicado antes da mudança para a pasta `public/`:

1. **Settings → Build and Deployment**: confira que nenhum override sobrescreve o `vercel.json` (Framework Preset `Other`, sem Build Command nem Output Directory customizados).
2. **Settings → Environment Variables**: adicione `SOCKET_SERVER_URL`.
3. **Deployments → Redeploy**. Variáveis de ambiente só têm efeito em um novo build.

### Como a URL chega no navegador

O front estático não lê variáveis de ambiente diretamente. No build, `scripts/build-config.js` gera `public/config.js` assim:

```js
window.SOCKET_SERVER_URL = "https://batalha-naval-online.onrender.com";
```

O `index.html` carrega `config.js` antes do `game.js`, que conecta com `io(window.SOCKET_SERVER_URL)`. Quando o valor está vazio (caso do arquivo versionado no repositório), o cliente conecta no mesmo domínio que serviu a página. É isso que faz o `npm start` local funcionar sem configuração extra.

O cliente Socket.IO vem do CDN jsDelivr (`socket.io-client@4.8.1`), porque `/socket.io/socket.io.js` só existe quando a página é servida pelo próprio `server.js`.

---

## 3. Liberar o CORS no servidor

Volte ao Render, **Environment → `CORS_ORIGIN`**, e coloque a URL da Vercel **sem barra no final**:

```
CORS_ORIGIN=https://batalha-naval-game-three.vercel.app
```

Para aceitar mais de uma origem (ex.: domínio próprio + preview), separe por vírgula:

```
CORS_ORIGIN=https://batalha-naval-game-three.vercel.app,https://meudominio.com
```

Salve. O Render reinicia o serviço sozinho.

> Sem `CORS_ORIGIN`, o servidor aceita qualquer origem. Isso é útil para testar, mas em produção defina o valor.

---

## 4. Checklist de verificação

1. `https://<servidor>/health` responde `{"ok":true,...}`.
2. `https://<front>.vercel.app/config.js` mostra a URL do servidor (não `""`).
3. Abra o front em duas abas ou dois dispositivos → **ONLINE** → crie o lobby em uma e entre com o código na outra.
4. Posicione os navios nas duas abas → a partida começa com o Jogador 1.
5. Erre um tiro → o turno passa para o adversário e o tabuleiro dele fica clicável. Acerte → continua no mesmo jogador.

## Problemas comuns

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| "Nao foi possivel conectar ao servidor online." | `SOCKET_SERVER_URL` errada/vazia, ou servidor dormindo | Confira `/config.js`, faça redeploy na Vercel, aguarde o Render acordar |
| Erro de CORS no console do navegador | `CORS_ORIGIN` não bate com a URL da Vercel | Use a URL exata, com `https://` e sem `/` final |
| `config.js` ainda mostra `""` | Variável adicionada depois do build | Redeploy na Vercel |
| Deploy na Vercel tenta rodar `server.js` como função | Override no painel ignorando o `vercel.json` | Remova os overrides de Framework/Build/Output |
| Lobby some depois de um tempo | Servidor reiniciou (salas ficam em memória) | Esperado no plano free; crie um novo lobby |
