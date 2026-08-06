# Regras do Realtime Database

O banco está hoje **aberto para leitura e escrita sem autenticação**. Verificado por
requisição direta à REST API do Firebase: respondeu `HTTP 200` com a lista de nós
(`members`, `history`, `bookings`, ...). Isso expõe o cadastro de sócios — nome
associado ao número do título — e o histórico de quem jogou, com quem e quando.

Nenhuma correção no código JavaScript resolve isso. As regras são avaliadas no
servidor do Firebase e só podem ser alteradas no console.

## Passo 1 — Estancar agora

Console Firebase → **Realtime Database** → aba **Regras** → colar o conteúdo de
[`database.rules.lockdown.json`](database.rules.lockdown.json) → **Publicar**.

Isso fecha o acesso imediatamente. **Atenção:** o sistema para de sincronizar
enquanto essas regras estiverem ativas, porque hoje ele não autentica ninguém
(zero ocorrências de `firebase.auth` no projeto). Cada dispositivo continua
funcionando com os dados locais, mas os aparelhos deixam de conversar entre si.

Use este passo se a prioridade for parar a exposição imediatamente, aceitando o
sistema em modo isolado por algumas horas.

## Passo 2 — Reabrir com autenticação

[`database.rules.auth.json`](database.rules.auth.json) é o estado final pretendido,
mas ele **exige alterações no código antes de ser publicado**:

1. Habilitar um provedor em **Authentication** no console (E-mail/senha para os
   perfis da recepção e da diretoria).
2. Criar as contas dos funcionários no console — não no código.
3. Fazer o app chamar `firebase.auth().signInWithEmailAndPassword(...)` na tela de
   login e só chamar `connectFirebase()` depois que a autenticação retornar.
4. Separar os dados em dois nós: `rq_state` (privado, exige login) e `rq_public`
   (somente status das quadras, sem nome de sócio e sem número de título) — é o nó
   que a tela de TV do saguão consome.

O passo 4 é o que permite manter o painel público sem expor dados pessoais.

## Sobre as senhas atuais

`USER_PASSWORDS` no `index.html` traz `esportes` / `diretora` em texto puro. Como
o repositório é público e o arquivo é servido ao navegador, essas senhas devem ser
consideradas **permanentemente comprometidas** — inclusive porque continuam no
histórico do git mesmo após serem trocadas.

Senha em código de front-end não protege dado nenhum: ela só esconde botões na
interface. A proteção real vem do Passo 2, onde o servidor passa a decidir quem lê
o quê.
