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
        ["Comenzar"] = ["Start", "Starten", "Comenzar", "Commencer", "Avvia", "Iniciar", "Начать"]
    };

    private static readonly int LocaleIndex = DetectLocaleIndex();

    private static int DetectLocaleIndex()
    {
        var culture = CultureInfo.CurrentUICulture;
        var exact = Array.IndexOf(Locales, culture.Name);
        if (exact >= 0) return exact;
        var language = culture.TwoLetterISOLanguageName;
        for (var i = 0; i < Locales.Length; i++)
            if (Locales[i].StartsWith(language + "-", StringComparison.OrdinalIgnoreCase))
                return i;
        return 0;
    }

    public static string T(string value) =>
        Translations.TryGetValue(value, out var translations) ? translations[LocaleIndex] : value;

    public static void Apply(Window window)
    {
        foreach (var control in window.GetVisualDescendants().OfType<TextBlock>())
            if (control.Text is { } text) control.Text = T(text);
        foreach (var button in window.GetVisualDescendants().OfType<Button>())
            if (button.Content is string text) button.Content = T(text);
        window.Title = T(window.Title);
    }
}
