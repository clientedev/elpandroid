# ELP Android - Aplicativo Mobile Nativo Oficial

Aplicativo Android nativo para gestão técnica de obras, inspeções de fachadas, agendamento de visitas, aprovação de relatórios e controle de reembolsos.

Desenvolvido para atender aos requisitos de funcionamento **Offline-First**, com persistência local em SQLite e sincronização direta com o backend em produção no Railway:
`https://elpandroid-production.up.railway.app/`

---

## 🏗️ 1. Arquitetura do Sistema

```
                 SMARTPHONE ANDROID
                         │
                         ▼
        ┌──────────────────────────────────┐
        │        APLICATIVO NATIVO         │
        │   (React Native + Expo SDK 57)   │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │      BANCO DE DADOS LOCAL        │
        │   expo-sqlite (SQLite nativo)    │
        │   Cache offline + Fila de Sync   │
        └────────────────┬─────────────────┘
                         │
                   SINCRONIZAÇÃO
            (Automática via NetInfo/Axios)
                         │
                         ▼
        ┌──────────────────────────────────┐
        │    API BACKEND FIXA (RAILWAY)    │
        │ elpandroid-production.up.railway │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │        BANCO NA NUVEM            │
        │      PostgreSQL (Railway)        │
        └──────────────────────────────────┘
```

---

## ⚡ 2. Atualização Automática do APK

O aplicativo conta com sistema contínuo de atualização:
1. **No Aplicativo**: A cada deploy no servidor ou publicação OTA (`expo-updates`), o app detecta e exibe:
   > *"Tem uma atualização recente. Deseja atualizar?"*
   Ao confirmar, o aplicativo baixa e aplica as alterações na hora.
2. **Build Automático via GitHub Actions**: Cada `git push` na branch `main` dispara um fluxo automatizado que compila o novo APK e o publica nas Releases do GitHub como `ELP.apk`.
3. **Build Local Rápido**:
   ```bash
   npm run build:apk
   ```
   *Gera e copia automaticamente o `ELP.apk` atualizado para a raiz do projeto.*

---

## 📦 3. Como Gerar o Arquivo APK (.apk)

### Opção A: Build Local com 1 Comando (Recomendado)
```bash
npm run build:apk
```
*O executável atualizado será gerado diretamente na raiz do projeto: `./ELP.apk`.*

### Opção B: Build Automatizado na Nuvem (GitHub Actions)
Todo `push` na branch `main` compila o APK automaticamente e disponibiliza o download na aba de **Releases** do GitHub.

### Opção C: EAS Build (Expo Cloud)
```bash
npx eas-cli build -p android --profile preview
```

---

## 🚀 5. Como Executar em Modo de Desenvolvimento

```bash
# Entrar na pasta do projeto
cd ObraFlowAndroid

# Iniciar o servidor de desenvolvimento
npx expo start --android
```

---

## 🛡️ Repositório Independente
Este projeto é um repositório Git 100% autônomo, localizado em sua própria pasta e sem qualquer acoplamento de arquivos com o projeto original.
