using System.Globalization;
using Avalonia.Controls;
using Avalonia.VisualTree;

namespace MoonlightTizenInstaller;

/// <summary>Automatic UI language selection for the seven locales supported by Moonlight for Tizen.</summary>
internal static class InstallerLocalization
{
    private static readonly string[] Locales = ["en-US", "de-DE", "es-ES", "fr-FR", "it-IT", "pt-BR", "ru-RU"];
    private static readonly Dictionary<string, string[]> Translations = new()
    {
        ["Inicio"] = ["Welcome", "Willkommen", "Inicio", "Accueil", "Benvenuto", "Início", "Начало"],
        ["Select the installer language"] = ["Select the installer language", "Installationssprache auswählen", "Selecciona el idioma del instalador", "Choisissez la langue du programme d’installation", "Seleziona la lingua del programma di installazione", "Selecione o idioma do instalador", "Выберите язык установщика"],
        ["Televisor"] = ["TV", "Fernseher", "Televisor", "Téléviseur", "Televisore", "Televisor", "Телевизор"],
        ["Conexión"] = ["Connection", "Verbindung", "Conexión", "Connexion", "Connessione", "Conexão", "Подключение"],
        ["Certificado"] = ["Certificate", "Zertifikat", "Certificado", "Certificat", "Certificato", "Certificado", "Сертификат"],
        ["Instalación"] = ["Installation", "Installation", "Instalación", "Installation", "Installazione", "Instalação", "Установка"],
        ["ASISTENTE DE INSTALACIÓN"] = ["INSTALLATION WIZARD", "INSTALLATIONSASSISTENT", "ASISTENTE DE INSTALACIÓN", "ASSISTANT D’INSTALLATION", "PROCEDURA GUIDATA DI INSTALLAZIONE", "ASSISTENTE DE INSTALAÇÃO", "МАСТЕР УСТАНОВКИ"],
        ["Instala Moonlight en tu TV con TizenOS."] = ["Install Moonlight on your TizenOS TV.", "Installiere Moonlight auf deinem TizenOS-Fernseher.", "Instala Moonlight en tu TV con TizenOS.", "Installez Moonlight sur votre téléviseur TizenOS.", "Installa Moonlight sulla tua TV con TizenOS.", "Instale o Moonlight na sua TV com TizenOS.", "Установите Moonlight на телевизор с TizenOS."],
        ["Este asistente detectará tu televisor y te guiará durante la instalación de Moonlight."] = ["This wizard will detect your TV and guide you through the Moonlight installation.", "Dieser Assistent erkennt deinen Fernseher und führt dich durch die Installation von Moonlight.", "Este asistente detectará tu televisor y te guiará durante la instalación de Moonlight.", "Cet assistant détectera votre téléviseur et vous guidera lors de l’installation de Moonlight.", "Questa procedura rileverà la TV e guiderà l’installazione di Moonlight.", "Este assistente detectará sua TV e orientará você durante a instalação do Moonlight.", "Мастер обнаружит телевизор и поможет установить Moonlight."],
        ["Antes de empezar"] = ["Before you begin", "Bevor du beginnst", "Antes de empezar", "Avant de commencer", "Prima di iniziare", "Antes de começar", "Перед началом"],
        ["PASO 2 · TELEVISOR"] = ["STEP 2 · TV", "SCHRITT 2 · FERNSEHER", "PASO 2 · TELEVISOR", "ÉTAPE 2 · TÉLÉVISEUR", "PASSAGGIO 2 · TV", "ETAPA 2 · TV", "ШАГ 2 · ТЕЛЕВИЗОР"],
        ["Buscando tu TV con TizenOS"] = ["Searching for your TizenOS TV", "Suche nach deinem TizenOS-Fernseher", "Buscando tu TV con TizenOS", "Recherche de votre téléviseur TizenOS", "Ricerca della TV con TizenOS", "Procurando sua TV com TizenOS", "Поиск телевизора с TizenOS"],
        ["Se detectan automáticamente los televisores de la red local. No se solicitará el DUID manualmente."] = ["TVs on the local network are detected automatically. You will not be asked to enter the DUID manually.", "Fernseher im lokalen Netzwerk werden automatisch erkannt. Du musst die DUID nicht manuell eingeben.", "Se detectan automáticamente los televisores de la red local. No se solicitará el DUID manualmente.", "Les téléviseurs du réseau local sont détectés automatiquement. Aucune saisie manuelle du DUID ne sera demandée.", "Le TV sulla rete locale vengono rilevate automaticamente. Non sarà necessario inserire manualmente il DUID.", "As TVs na rede local são detectadas automaticamente. Não será necessário informar o DUID manualmente.", "Телевизоры в локальной сети обнаруживаются автоматически. Вводить DUID вручную не потребуется."],
        ["Preparando la detección…"] = ["Preparing detection…", "Erkennung wird vorbereitet…", "Preparando la detección…", "Préparation de la détection…", "Preparazione del rilevamento…", "Preparando a detecção…", "Подготовка к обнаружению…"],
        ["Detectando televisores con TizenOS en la red local…"] = ["Detecting TizenOS TVs on the local network…", "TizenOS-Fernseher im lokalen Netzwerk werden gesucht…", "Detectando televisores con TizenOS en la red local…", "Détection des téléviseurs TizenOS sur le réseau local…", "Ricerca delle TV con TizenOS nella rete locale…", "Detectando TVs com TizenOS na rede local…", "Поиск телевизоров с TizenOS в локальной сети…"],
        ["Activa Developer Mode"] = ["Enable Developer Mode", "Entwicklermodus aktivieren", "Activa Developer Mode", "Activer le mode développeur", "Attiva la modalità sviluppatore", "Ative o Modo de Desenvolvedor", "Включите режим разработчика"],
        ["Reintentar"] = ["Retry", "Erneut versuchen", "Reintentar", "Réessayer", "Riprova", "Tentar novamente", "Повторить"],
        ["PASO 3 · CONEXIÓN"] = ["STEP 3 · CONNECTION", "SCHRITT 3 · VERBINDUNG", "PASO 3 · CONEXIÓN", "ÉTAPE 3 · CONNEXION", "PASSAGGIO 3 · CONNESSIONE", "ETAPA 3 · CONEXÃO", "ШАГ 3 · ПОДКЛЮЧЕНИЕ"],
        ["Conexión con el televisor"] = ["TV connection", "Verbindung mit dem Fernseher", "Conexión con el televisor", "Connexion au téléviseur", "Connessione alla TV", "Conexão com a TV", "Подключение к телевизору"],
        ["Comprobando la vía de instalación disponible…"] = ["Checking the available installation method…", "Verfügbare Installationsmethode wird überprüft…", "Comprobando la vía de instalación disponible…", "Vérification de la méthode d’installation disponible…", "Verifica del metodo di installazione disponibile…", "Verificando o método de instalação disponível…", "Проверка доступного способа установки…"],
        ["Completa la instalación en el televisor"] = ["Complete the installation on your TV", "Schließe die Installation auf dem Fernseher ab", "Completa la instalación en el televisor", "Terminez l’installation sur le téléviseur", "Completa l’installazione sulla TV", "Conclua a instalação na TV", "Завершите установку на телевизоре"],
        ["Finalizar"] = ["Finish", "Fertigstellen", "Finalizar", "Terminer", "Fine", "Concluir", "Готово"],
        ["PASO 4 · CERTIFICADO"] = ["STEP 4 · CERTIFICATE", "SCHRITT 4 · ZERTIFIKAT", "PASO 4 · CERTIFICADO", "ÉTAPE 4 · CERTIFICAT", "PASSAGGIO 4 · CERTIFICATO", "ETAPA 4 · CERTIFICADO", "ШАГ 4 · СЕРТИФИКАТ"],
        ["Preparar el certificado de instalación"] = ["Prepare the installation certificate", "Installationszertifikat vorbereiten", "Preparar el certificado de instalación", "Préparer le certificat d’installation", "Preparare il certificato di installazione", "Preparar o certificado de instalação", "Подготовка сертификата установки"],
        ["Crear o renovar certificado Partner"] = ["Create or renew Partner certificate", "Partner-Zertifikat erstellen oder erneuern", "Crear o renovar certificado Partner", "Créer ou renouveler un certificat Partner", "Crea o rinnova il certificato Partner", "Criar ou renovar certificado Partner", "Создать или обновить сертификат Partner"],
        ["PASO 5 · INSTALACIÓN"] = ["STEP 5 · INSTALLATION", "SCHRITT 5 · INSTALLATION", "PASO 5 · INSTALACIÓN", "ÉTAPE 5 · INSTALLATION", "PASSAGGIO 5 · INSTALLAZIONE", "ETAPA 5 · INSTALAÇÃO", "ШАГ 5 · УСТАНОВКА"],
        ["Instalar Moonlight"] = ["Install Moonlight", "Moonlight installieren", "Instalar Moonlight", "Installer Moonlight", "Installa Moonlight", "Instalar Moonlight", "Установить Moonlight"],
        ["Atrás"] = ["Back", "Zurück", "Atrás", "Retour", "Indietro", "Voltar", "Назад"],
        ["Salir"] = ["Exit", "Beenden", "Salir", "Quitter", "Esci", "Sair", "Выход"],
        ["Comenzar"] = ["Start", "Starten", "Comenzar", "Commencer", "Avvia", "Iniciar", "Начать"],

        ["• Enciende el televisor y conéctalo a la misma red local que este ordenador."] = ["• Turn on the TV and connect it to the same local network as this computer.", "• Schalte den Fernseher ein und verbinde ihn mit demselben lokalen Netzwerk wie diesen Computer.", "• Enciende el televisor y conéctalo a la misma red local que este ordenador.", "• Allumez le téléviseur et connectez-le au même réseau local que cet ordinateur.", "• Accendi la TV e collegala alla stessa rete locale di questo computer.", "• Ligue a TV e conecte-a à mesma rede local deste computador.", "• Включите телевизор и подключите его к той же локальной сети, что и этот компьютер."],
        ["• Si Developer Mode aún no está activado, el asistente te mostrará cómo hacerlo y qué dirección IP debes introducir."] = ["• If Developer Mode is not enabled, the wizard will show you how to enable it and which IP address to enter.", "• Falls der Entwicklermodus nicht aktiviert ist, zeigt dir der Assistent, wie du ihn aktivierst und welche IP-Adresse du eingeben musst.", "• Si Developer Mode aún no está activado, el asistente te mostrará cómo hacerlo y qué dirección IP debes introducir.", "• Si le mode développeur n’est pas activé, l’assistant vous expliquera comment l’activer et quelle adresse IP saisir.", "• Se la modalità sviluppatore non è attiva, la procedura mostrerà come abilitarla e quale indirizzo IP inserire.", "• Se o Modo de Desenvolvedor não estiver ativado, o assistente mostrará como ativá-lo e qual endereço IP informar.", "• Если режим разработчика не включён, мастер покажет, как его включить и какой IP-адрес указать."],
        ["1. Enciende el televisor y abre la sección Apps."] = ["1. Turn on the TV and open the Apps section.", "1. Schalte den Fernseher ein und öffne den Bereich Apps.", "1. Enciende el televisor y abre la sección Apps.", "1. Allumez le téléviseur et ouvrez la section Apps.", "1. Accendi la TV e apri la sezione Apps.", "1. Ligue a TV e abra a seção Apps.", "1. Включите телевизор и откройте раздел Apps."],
        ["2. Con el mando a distancia, introduce 12345 para abrir el menú de Developer Mode."] = ["2. Using the remote, enter 12345 to open the Developer Mode menu.", "2. Gib mit der Fernbedienung 12345 ein, um das Menü des Entwicklermodus zu öffnen.", "2. Con el mando a distancia, introduce 12345 para abrir el menú de Developer Mode.", "2. À l’aide de la télécommande, saisissez 12345 pour ouvrir le menu du mode développeur.", "2. Con il telecomando, inserisci 12345 per aprire il menu della modalità sviluppatore.", "2. Usando o controle remoto, digite 12345 para abrir o menu do Modo de Desenvolvedor.", "2. С помощью пульта введите 12345, чтобы открыть меню режима разработчика."],
        ["3. Activa Developer Mode (ON)."] = ["3. Turn Developer Mode ON.", "3. Aktiviere den Entwicklermodus (ON).", "3. Activa Developer Mode (ON).", "3. Activez le mode développeur (ON).", "3. Attiva la modalità sviluppatore (ON).", "3. Ative o Modo de Desenvolvedor (ON).", "3. Включите режим разработчика (ON)."],
        ["4. En Host PC IP, introduce esta dirección:"] = ["4. Enter this address in Host PC IP:", "4. Gib diese Adresse unter Host PC IP ein:", "4. En Host PC IP, introduce esta dirección:", "4. Saisissez cette adresse dans Host PC IP :", "4. Inserisci questo indirizzo in Host PC IP:", "4. Informe este endereço em Host PC IP:", "4. Укажите этот адрес в поле Host PC IP:"],
        ["5. Confirma la configuración y reinicia el televisor si lo solicita. Después pulsa Reintentar."] = ["5. Confirm the settings and restart the TV if prompted. Then click Retry.", "5. Bestätige die Einstellungen und starte den Fernseher bei Aufforderung neu. Klicke anschließend auf Erneut versuchen.", "5. Confirma la configuración y reinicia el televisor si lo solicita. Después pulsa Reintentar.", "5. Confirmez les paramètres et redémarrez le téléviseur si demandé. Cliquez ensuite sur Réessayer.", "5. Conferma le impostazioni e riavvia la TV se richiesto. Poi fai clic su Riprova.", "5. Confirme as configurações e reinicie a TV, se solicitado. Depois clique em Tentar novamente.", "5. Подтвердите настройки и перезагрузите телевизор, если потребуется. Затем нажмите «Повторить»."],
        ["Se han detectado varios televisores. Selecciona el que quieras utilizar:"] = ["Multiple TVs were detected. Select the one you want to use:", "Es wurden mehrere Fernseher erkannt. Wähle den gewünschten Fernseher aus:", "Se han detectado varios televisores. Selecciona el que quieras utilizar:", "Plusieurs téléviseurs ont été détectés. Sélectionnez celui que vous souhaitez utiliser :", "Sono state rilevate più TV. Seleziona quella che desideri utilizzare:", "Várias TVs foram detectadas. Selecione aquela que deseja usar:", "Обнаружено несколько телевизоров. Выберите нужный:"],
        ["Pulsa «Aceptar» en el mensaje de confirmación que aparece en el televisor."] = ["Press “Accept” on the confirmation message displayed on your TV.", "Drücke „OK“ in der Bestätigungsmeldung auf deinem Fernseher.", "Pulsa «Aceptar» en el mensaje de confirmación que aparece en el televisor.", "Appuyez sur « Accepter » dans le message de confirmation affiché sur le téléviseur.", "Premi «Accetta» nel messaggio di conferma visualizzato sulla TV.", "Pressione “Aceitar” na mensagem de confirmação exibida na TV.", "Нажмите «Принять» в сообщении подтверждения на экране телевизора."],
        ["El instalador reutiliza automáticamente un certificado Partner válido guardado de una ejecución anterior. Solo abrirá el portal de certificados si hace falta crear uno o renovarlo."] = ["The installer automatically reuses a valid Partner certificate saved from a previous run. The certificate portal opens only when a certificate must be created or renewed.", "Das Installationsprogramm verwendet automatisch ein gültiges Partner-Zertifikat aus einem früheren Durchlauf. Das Zertifikatsportal wird nur geöffnet, wenn ein Zertifikat erstellt oder erneuert werden muss.", "El instalador reutiliza automáticamente un certificado Partner válido guardado de una ejecución anterior. Solo abrirá el portal de certificados si hace falta crear uno o renovarlo.", "Le programme réutilise automatiquement un certificat Partner valide enregistré lors d’une précédente exécution. Le portail ne s’ouvre que si un certificat doit être créé ou renouvelé.", "Il programma riutilizza automaticamente un certificato Partner valido salvato in una precedente esecuzione. Il portale si apre solo se è necessario creare o rinnovare un certificato.", "O instalador reutiliza automaticamente um certificado Partner válido salvo em uma execução anterior. O portal só será aberto se for necessário criar ou renovar um certificado.", "Установщик автоматически использует действующий сертификат Partner, сохранённый ранее. Портал откроется только при необходимости создать или обновить сертификат."],
        ["El paquete se firmará con el perfil Partner y se instalará en el televisor."] = ["The package will be signed with the Partner profile and installed on the TV.", "Das Paket wird mit dem Partner-Profil signiert und auf dem Fernseher installiert.", "El paquete se firmará con el perfil Partner y se instalará en el televisor.", "Le paquet sera signé avec le profil Partner puis installé sur le téléviseur.", "Il pacchetto verrà firmato con il profilo Partner e installato sulla TV.", "O pacote será assinado com o perfil Partner e instalado na TV.", "Пакет будет подписан профилем Partner и установлен на телевизор."],

        ["Se ha detectado que TV-Store está instalado en uno de tus dispositivos ({0}). ¿Quieres utilizarlo para completar allí la instalación de Moonlight?"] = ["TV-Store is installed on one of your devices ({0}). Would you like to use it to complete the Moonlight installation there?", "TV-Store ist auf einem deiner Geräte ({0}) installiert. Möchtest du es verwenden, um Moonlight dort zu installieren?", "Se ha detectado que TV-Store está instalado en uno de tus dispositivos ({0}). ¿Quieres utilizarlo para completar allí la instalación de Moonlight?", "TV-Store est installé sur l’un de vos appareils ({0}). Voulez-vous l’utiliser pour terminer l’installation de Moonlight sur celui-ci ?", "TV-Store è installato su uno dei tuoi dispositivi ({0}). Vuoi usarlo per completare l’installazione di Moonlight?", "O TV-Store está instalado em um dos seus dispositivos ({0}). Deseja usá-lo para concluir a instalação do Moonlight?", "TV-Store установлен на одном из ваших устройств ({0}). Использовать его для завершения установки Moonlight?"],
        ["Sí, utilizar TV-Store"] = ["Yes, use TV-Store", "Ja, TV-Store verwenden", "Sí, utilizar TV-Store", "Oui, utiliser TV-Store", "Sì, usa TV-Store", "Sim, usar TV-Store", "Да, использовать TV-Store"],

        ["No"] = ["No", "Nein", "No", "Non", "No", "Não", "Нет"],

        ["Consultando dirección IP…"] = ["Checking IP address…", "IP-Adresse wird ermittelt…", "Consultando dirección IP…", "Vérification de l’adresse IP…", "Verifica dell’indirizzo IP…", "Consultando o endereço IP…", "Определение IP-адреса…"],
        ["Moonlight Tizen · Instalador"] = ["Moonlight Tizen · Installer", "Moonlight Tizen · Installationsprogramm", "Moonlight Tizen · Instalador", "Moonlight Tizen · Programme d’installation", "Moonlight Tizen · Programma di installazione", "Moonlight Tizen · Instalador", "Moonlight Tizen · Установщик"],
        ["No se ha podido determinar una IPv4 privada"] = ["Could not determine a private IPv4 address", "Eine private IPv4-Adresse konnte nicht ermittelt werden", "No se ha podido determinar una IPv4 privada", "Impossible de déterminer une adresse IPv4 privée", "Impossibile determinare un indirizzo IPv4 privato", "Não foi possível determinar um endereço IPv4 privado", "Не удалось определить частный IPv4-адрес"],
        ["Selecciona una TV con TizenOS para continuar."] = ["Select a TizenOS TV to continue.", "Wähle einen TizenOS-Fernseher aus, um fortzufahren.", "Selecciona una TV con TizenOS para continuar.", "Sélectionnez un téléviseur TizenOS pour continuer.", "Seleziona una TV con TizenOS per continuare.", "Selecione uma TV com TizenOS para continuar.", "Выберите телевизор с TizenOS, чтобы продолжить."],

        ["Enhanced version · with Dolby Digital audio support"] = ["Enhanced version · with Dolby Digital audio support", "Erweiterte Version · mit Dolby-Digital-Audio-Unterstützung", "Versión mejorada · con compatibilidad de audio Dolby Digital", "Version améliorée · avec prise en charge de l’audio Dolby Digital", "Versione avanzata · con supporto audio Dolby Digital", "Versão aprimorada · com suporte a áudio Dolby Digital", "Расширенная версия · с поддержкой звука Dolby Digital"],
        ["Se han detectado {0} televisores con TizenOS. Selecciona uno y pulsa «Siguiente» para continuar."] = ["{0} TizenOS TVs were detected. Select one and click “Next” to continue.", "Es wurden {0} TizenOS-Fernseher erkannt. Wähle einen aus und klicke auf „Weiter“.", "Se han detectado {0} televisores con TizenOS. Selecciona uno y pulsa «Siguiente» para continuar.", "{0} téléviseurs TizenOS détectés. Sélectionnez-en un et cliquez sur « Suivant » pour continuer.", "Rilevate {0} TV con TizenOS. Selezionane una e fai clic su «Avanti» per continuare.", "{0} TVs com TizenOS detectadas. Selecione uma e clique em “Avançar” para continuar.", "Обнаружено телевизоров с TizenOS: {0}. Выберите один и нажмите «Далее»."],
        ["No se ha detectado ninguna TV con TizenOS en la red local. Comprueba que está encendida y conectada a la misma red que este equipo. Para continuar será necesario activar Developer Mode y volver a detectar el televisor."] = ["No TizenOS TV was detected on the local network. Make sure it is powered on and connected to the same network as this computer. Enable Developer Mode and run detection again.", "Im lokalen Netzwerk wurde kein TizenOS-Fernseher gefunden. Stelle sicher, dass er eingeschaltet und mit demselben Netzwerk verbunden ist. Aktiviere den Entwicklermodus und starte die Erkennung erneut.", "No se ha detectado ninguna TV con TizenOS en la red local. Comprueba que está encendida y conectada a la misma red que este equipo. Para continuar será necesario activar Developer Mode y volver a detectar el televisor.", "Aucun téléviseur TizenOS détecté sur le réseau local. Vérifiez qu’il est allumé et connecté au même réseau. Activez le mode développeur puis relancez la détection.", "Nessuna TV con TizenOS rilevata nella rete locale. Verifica che sia accesa e connessa alla stessa rete. Attiva la modalità sviluppatore e ripeti il rilevamento.", "Nenhuma TV com TizenOS foi detectada na rede local. Verifique se está ligada e conectada à mesma rede. Ative o Modo de Desenvolvedor e tente novamente.", "Телевизор с TizenOS в локальной сети не обнаружен. Убедитесь, что он включён и подключён к той же сети. Включите режим разработчика и повторите поиск."]
    };

    private static int _localeIndex = DetectLocaleIndex();
    public static bool HasSupportedSystemLocale { get; } = _localeIndex >= 0;
    public static int LocaleCount => Locales.Length;

    private static int DetectLocaleIndex()
    {
        var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        for (var i = 0; i < Locales.Length; i++)
            if (Locales[i].StartsWith(language + "-", StringComparison.OrdinalIgnoreCase))
                return i;
        return -1;
    }

    public static void SelectLocale(int index)
    {
        if (index < 0 || index >= Locales.Length)
            throw new ArgumentOutOfRangeException(nameof(index));
        _localeIndex = index;
    }

    public static string T(string? value)
    {
        if (value is null) return string.Empty;
        if (Translations.TryGetValue(value, out var direct))
            return direct[Math.Max(_localeIndex, 0)];

        // Apply can run again after a manual choice. Resolve text already translated
        // during the initial English fallback back to its source entry first.
        foreach (var pair in Translations)
            if (Array.IndexOf(pair.Value, value) >= 0)
                return pair.Value[Math.Max(_localeIndex, 0)];

        return value;
    }

    public static void Apply(Window window)
    {
        foreach (var control in window.GetVisualDescendants().OfType<TextBlock>())
            if (control.Text is { } text) control.Text = T(text);
        foreach (var button in window.GetVisualDescendants().OfType<Button>())
            if (button.Content is string text) button.Content = T(text);
        window.Title = T(window.Title);
    }
}
