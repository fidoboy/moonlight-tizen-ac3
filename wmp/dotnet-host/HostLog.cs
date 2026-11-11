namespace MoonlightWmpHost
{
    internal static class Log
    {
        internal static void Trace(string message)
        {
            Tizen.Log.Debug("MLHOST", message);
        }

        internal static void Info(string message)
        {
            Tizen.Log.Info("MLHOST", message);
        }

        internal static void Error(string message)
        {
            Tizen.Log.Error("MLHOST", message);
        }
    }
}
