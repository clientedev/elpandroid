# ObraFlow Android - Aplicativo Mobile Nativo Oficial

Aplicativo Android nativo para gestão técnica de obras, inspeções de fachadas, agendamento de visitas, aprovação de relatórios e controle de reembolsos.

Desenvolvido para atender aos requisitos de funcionamento **Offline-First**, permitindo que engenheiros e fiscais de campo trabalhem em canteiros de obras sem sinal de internet, com sincronização automática e persistência em banco de dados **PostgreSQL hospedado no Railway**.

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
        │          API BACKEND             │
        │      (Flask / Python REST)       │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │        BANCO NA NUVEM            │
        │      PostgreSQL (Railway)        │
        └──────────────────────────────────┘
```

### Por que React Native + Expo?
1. **Geração Real de APK**: Gera arquivos `.apk` prontos para instalação direta em celulares Android via **EAS Build** ou build local.
2. **Offline-First Nativo com SQLite**: Utiliza o driver C nativo do SQLite através do `expo-sqlite`, garantindo operações instantâneas e sem latência.
3. **Câmera e Arquivos Nativos**: Acesso direto à câmera do dispositivo, galeria e sistema de arquivos (`expo-file-system` e `expo-image-picker`).
4. **Geração de PDF Offline**: Emissão e compartilhamento de relatórios técnicos em PDF diretamente no celular via `expo-print` e `expo-sharing`, sem depender de internet.
5. **Segurança de Credenciais**: Tokens de sessão e dados sensíveis protegidos por criptografia de hardware via `expo-secure-store`.

---

## 📱 2. Módulos e Funcionalidades

| Módulo | Sistema Original | Aplicativo Android | Funcionamento Offline |
| :--- | :--- | :--- | :--- |
| **Autenticação** | Flask-Login | AuthContext + SecureStore | ✅ Login com cache local |
| **Obras / Projetos** | CRUD Projetos + Specs | SQLite + Sync Queue | ✅ Totalmente funcional |
| **Visitas / Agenda** | Calendário de Visitas | VisitasList + Agendamento | ✅ Totalmente funcional |
| **Relatórios Comuns** | WeasyPrint + Fotos | Relatórios + Galeria + PDF | ✅ Totalmente funcional |
| **Relatórios Express**| Criação rápida EXP-XXXX | ExpressReportsScreen + PDF | ✅ Totalmente funcional |
| **Aprovação de Relatórios** | Painel Web | ApprovalDashboardScreen | ✅ Aprovação com sync posterior |
| **Reembolsos** | Solicitação despesas | ExpensesScreen (KM, Alim, etc) | ✅ Totalmente funcional |
| **Lembretes de Obra** | Lembretes persistentes | RemindersScreen | ✅ Totalmente funcional |
| **Contatos** | Contatos de construtora | ContactsScreen | ✅ Totalmente funcional |
| **Legendas Padrão** | 4 Categorias (Acabamentos, etc) | Legendas Modal pré-configuradas| ✅ Salvo localmente |

---

## ⚡ 3. Mecanismo de Sincronização e Conflitos

- **Modo Online**: Operações realizadas no aplicativo são executadas localmente e enviadas imediatamente ao servidor Railway.
- **Modo Offline**: Quando a conexão é interrompida, o banner superior alerta o usuário. Todas as criações (relatórios, fotos, obras, despesas) são persistidas no SQLite e marcadas com status `pending` na tabela `sync_queue`.
- **Retorno da Conexão**: O `NetworkContext` detecta a volta da internet automaticamente através do `NetInfo`, despacha os itens pendentes na fila em ordem cronológica e puxa as alterações do PostgreSQL do Railway para o SQLite do aparelho.

---

## 📦 4. Como Gerar o Arquivo APK (.apk)

O projeto está configurado com o arquivo `eas.json` para gerar builds em formato `.apk` instalável diretamente no Android.

### Opção A: Gerando APK com EAS Build (Recomendado na Nuvem)
1. Instale o EAS CLI (já incluído como dependência):
   ```bash
   npm install -g eas-cli
   ```
2. Faça login na sua conta Expo:
   ```bash
   npx eas-cli login
   ```
3. Execute o comando para gerar o APK de prévia/produção:
   ```bash
   npx eas-cli build -p android --profile preview
   ```
   *O arquivo `.apk` final será gerado e disponibilizado para download no painel da Expo ou pelo link fornecido no terminal.*

### Opção B: Build Local do APK (com Android Studio / SDK instalado)
1. Pré-compile o código nativo Android:
   ```bash
   npx expo prebuild --platform android
   ```
2. Navegue até a pasta android e gere o APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. O APK gerado estará em:
   `android/app/build/outputs/apk/release/app-release.apk`

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
